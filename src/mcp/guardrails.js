// Write-side guardrails / validation for the MSFS Pro MCP server.
//
// run_inspecthtml and send_event execute arbitrary commands against a live
// flight simulator. These validators reject malformed or dangerous input
// *before* it reaches SimConnect, returning structured reasons so the agent
// can correct course instead of silently misfiring hardware controls.
//
// Rules are grounded in the MSFS Pro SDK documentation:
//   - SimConnect_InspectHTML: URL must be "gc://instrument_id?args", max 2048 chars.
//   - SimConnect_MapClientEventToSimEvent: "No Microsoft Flight Simulator events
//     include periods" (a period denotes a private/custom client event), and
//     third-party events use the "#nnnn" / "#0xnnnn" forms.

// Per SDK: "there is a maximum total character length for the URL of 2048 characters."
const MAX_INSPECT_HTML_URL_LEN = 2048;

// Known gc:// verbs the server already relies on. Anything else is allowed but
// flagged so the caller knows it is off the beaten path.
const KNOWN_GC_VERBS = new Set([
  "SETSIMVAR",
  "GETALL",
  "INIT",
  "CLEAR_ROUTE_DISCONTINUITY",
  "CORRECT_ANY_ROUTE_DISCONTINUITY",
]);

// K-event name: uppercase letters, digits, and underscores (e.g. AP_MASTER,
// THROTTLE_SET, VIEW_CAMERA_SELECT_2). This is the canonical SimConnect form.
const KEVENT_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

// Third-party event reference forms accepted by MapClientEventToSimEvent.
const THIRD_PARTY_EVENT_RE = /^#(0x[0-9A-Fa-f]+|\d+)$/;

// Destructive / out-of-scope K-events. send_event is meant for cockpit and
// camera control, not for killing the sim session or the user's flight. These
// are blocked by default; callers who truly need them can use lower-level tools.
const BLOCKED_KEVENTS = new Set([
  "SIM_RESET",
  "EXIT",
  "QUIT",
  "ABORT",
  "MENU_QUIT",
  "KILL_SIM",
]);

function fail(code, reason, extra = {}) {
  return { ok: false, code, reason, ...extra };
}

function ok(extra = {}) {
  return { ok: true, ...extra };
}

/**
 * Validate an InspectHTML gc:// URL.
 * Returns { ok: true, instrumentId, verb, warnings[] } or { ok: false, code, reason }.
 */
function validateInspectHtmlUrl(rawUrl) {
  if (typeof rawUrl !== "string") {
    return fail("invalid_type", "url must be a string.");
  }
  const url = rawUrl.trim();
  if (!url) {
    return fail("empty", "url is required.");
  }
  if (url.length > MAX_INSPECT_HTML_URL_LEN) {
    return fail(
      "too_long",
      `url is ${url.length} chars; the SimConnect InspectHTML limit is ${MAX_INSPECT_HTML_URL_LEN}.`
    );
  }
  if (!url.startsWith("gc://")) {
    return fail(
      "bad_scheme",
      "InspectHTML URLs must use the gc:// scheme (gc://instrument_id?args). Got: " +
        url.slice(0, 32)
    );
  }
  // Reject embedded control characters / newlines that could corrupt the
  // null-terminated payload or smuggle extra content.
  if (/[\x00-\x1f\x7f]/.test(url)) {
    return fail("control_chars", "url contains control characters.");
  }

  const afterScheme = url.slice("gc://".length);
  const qIndex = afterScheme.indexOf("?");
  const instrumentId = (qIndex === -1 ? afterScheme : afterScheme.slice(0, qIndex)).trim();
  const query = qIndex === -1 ? "" : afterScheme.slice(qIndex + 1);

  if (!instrumentId) {
    return fail("missing_instrument", "url is missing an instrument id after gc://.");
  }

  const warnings = [];

  // The server's gc:// "verb" convention is either "INSTRUMENT?VERB::rest" or
  // "SETSIMVAR?NAME=...". Derive a best-effort verb for a sanity warning.
  let verb = null;
  if (instrumentId.toUpperCase() === "SETSIMVAR") {
    verb = "SETSIMVAR";
  } else if (query) {
    const doubleColon = query.indexOf("::");
    if (doubleColon !== -1) {
      verb = query.slice(0, doubleColon).split("&")[0].trim().toUpperCase();
    }
  }
  if (verb && !KNOWN_GC_VERBS.has(verb)) {
    warnings.push(
      `Unrecognized gc:// verb '${verb}'. Proceeding, but verify it is supported by the instrument.`
    );
  }

  return ok({ instrumentId, verb, warnings });
}

/**
 * Validate a SimConnect K-event name for send_event.
 * Returns { ok: true, eventName, warnings[] } or { ok: false, code, reason }.
 */
function validateEventName(rawName) {
  if (typeof rawName !== "string") {
    return fail("invalid_type", "eventName must be a string.");
  }
  const eventName = rawName.trim();
  if (!eventName) {
    return fail("empty", "eventName is required.");
  }

  // Third-party add-on event reference (#1234 / #0x04A2) — allowed as-is.
  if (THIRD_PARTY_EVENT_RE.test(eventName)) {
    return ok({ eventName, warnings: [] });
  }

  if (eventName.includes(".")) {
    return fail(
      "period_in_name",
      "Event names with a period are private/custom client events and are not " +
        "recognized by MSFS (per SDK). Use a standard event name such as AP_MASTER."
    );
  }

  if (!KEVENT_NAME_RE.test(eventName)) {
    return fail(
      "bad_format",
      "eventName must be an uppercase SimConnect event token (letters, digits, " +
        "underscores), e.g. AP_MASTER, THROTTLE_SET, VIEW_CAMERA_SELECT_2."
    );
  }

  if (BLOCKED_KEVENTS.has(eventName)) {
    return fail(
      "blocked",
      `Event '${eventName}' is blocked: it can end or reset the flight session. ` +
        "This guardrail protects the live sim."
    );
  }

  return ok({ eventName, warnings: [] });
}

/**
 * Validate the optional numeric data parameter for a K-event.
 * SimConnect transmits this as a 32-bit value; enforce an integer range.
 */
function validateEventData(rawData) {
  if (rawData === undefined || rawData === null) {
    return ok({ data: 0 });
  }
  if (typeof rawData !== "number" || !Number.isFinite(rawData)) {
    return fail("invalid_data", "data must be a finite number.");
  }
  if (!Number.isInteger(rawData)) {
    return fail("invalid_data", "data must be an integer (SimConnect sends a 32-bit value).");
  }
  // Accept both signed and unsigned 32-bit ranges.
  if (rawData < -2147483648 || rawData > 4294967295) {
    return fail("data_out_of_range", "data must fit in a 32-bit value.");
  }
  return ok({ data: rawData });
}

// SimVar / L:Var name for a SETSIMVAR write. Same character class as the watch
// registry: uppercase/lowercase letters, digits, space, and _ : . - (covers
// "L:XMLVAR_FOO", "GENERAL ENG RPM:1", "PLANE ALTITUDE").
const SETSIMVAR_NAME_RE = /^[A-Za-z0-9 _:.\-]+$/;

/**
 * Validate and build a SETSIMVAR gc:// URL for set_simvar.
 * Returns { ok: true, url, name, value, unit } or { ok: false, code, reason }.
 *
 * Values are URL-encoded so a stray '&' or '=' cannot inject extra query
 * parameters into the gc:// request.
 */
function buildSetSimVarUrl(rawName, rawValue, rawUnit) {
  if (typeof rawName !== "string") {
    return fail("invalid_type", "name must be a string.");
  }
  const name = rawName.trim();
  if (!name) return fail("empty", "name is required.");
  if (/[\x00-\x1f\x7f]/.test(name)) {
    return fail("control_chars", "name contains control characters.");
  }
  if (!SETSIMVAR_NAME_RE.test(name)) {
    return fail("bad_name", "name has invalid characters. Allowed: A-Z, 0-9, space, _ : . -");
  }

  // Value: accept a finite number or a plain (control-char-free) string.
  if (rawValue === undefined || rawValue === null) {
    return fail("missing_value", "value is required.");
  }
  let valueStr;
  if (typeof rawValue === "number") {
    if (!Number.isFinite(rawValue)) {
      return fail("invalid_value", "numeric value must be finite.");
    }
    valueStr = String(rawValue);
  } else if (typeof rawValue === "string") {
    if (/[\x00-\x1f\x7f]/.test(rawValue)) {
      return fail("control_chars", "value contains control characters.");
    }
    valueStr = rawValue;
  } else {
    return fail("invalid_value", "value must be a number or a string.");
  }

  const unit = (typeof rawUnit === "string" && rawUnit.trim()) ? rawUnit.trim() : "number";
  if (/[\x00-\x1f\x7f]/.test(unit)) {
    return fail("control_chars", "unit contains control characters.");
  }

  const url =
    "gc://SETSIMVAR?" +
    encodeURIComponent(name) + "=" + encodeURIComponent(valueStr) +
    "&unit=" + encodeURIComponent(unit);

  if (url.length > MAX_INSPECT_HTML_URL_LEN) {
    return fail("too_long", `Resulting URL is ${url.length} chars; limit is ${MAX_INSPECT_HTML_URL_LEN}.`);
  }

  return ok({ url, name, value: valueStr, unit });
}

module.exports = {
  MAX_INSPECT_HTML_URL_LEN,
  KNOWN_GC_VERBS,
  BLOCKED_KEVENTS,
  validateInspectHtmlUrl,
  validateEventName,
  validateEventData,
  buildSetSimVarUrl,
};
