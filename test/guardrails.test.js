const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MAX_INSPECT_HTML_URL_LEN,
  validateInspectHtmlUrl,
  validateEventName,
  validateEventData,
  buildSetSimVarUrl,
} = require("../src/mcp/guardrails");

// --- validateInspectHtmlUrl ---

test("accepts a well-formed gc:// SETSIMVAR url", () => {
  const r = validateInspectHtmlUrl("gc://SETSIMVAR?L:XMLVAR_FCC_FD_1_Value=1&unit=number");
  assert.equal(r.ok, true);
  assert.equal(r.instrumentId, "SETSIMVAR");
  assert.equal(r.verb, "SETSIMVAR");
  assert.deepEqual(r.warnings, []);
});

test("accepts a well-formed FMC INIT url and extracts the verb", () => {
  const r = validateInspectHtmlUrl("gc://AS05B_FMC_1?INIT::RTE 1&ORIGIN=KSEA&DEST=KGEG");
  assert.equal(r.ok, true);
  assert.equal(r.instrumentId, "AS05B_FMC_1");
  assert.equal(r.verb, "INIT");
});

test("warns on an unrecognized gc:// verb but still allows it", () => {
  const r = validateInspectHtmlUrl("gc://AS05B_FMC_1?FRANKENVERB::do stuff");
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /FRANKENVERB/);
});

test("rejects non-gc scheme", () => {
  const r = validateInspectHtmlUrl("http://evil.example/x");
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_scheme");
});

test("rejects empty / non-string url", () => {
  assert.equal(validateInspectHtmlUrl("").ok, false);
  assert.equal(validateInspectHtmlUrl("   ").ok, false);
  assert.equal(validateInspectHtmlUrl(null).ok, false);
  assert.equal(validateInspectHtmlUrl(42).code, "invalid_type");
});

test("rejects a url missing an instrument id", () => {
  const r = validateInspectHtmlUrl("gc://?foo=bar");
  assert.equal(r.ok, false);
  assert.equal(r.code, "missing_instrument");
});

test("rejects urls over the SDK 2048-char limit", () => {
  const longQuery = "gc://AS05B_FMC_1?INIT::RTE&X=" + "A".repeat(MAX_INSPECT_HTML_URL_LEN);
  const r = validateInspectHtmlUrl(longQuery);
  assert.equal(r.ok, false);
  assert.equal(r.code, "too_long");
});

test("rejects embedded control characters", () => {
  const r = validateInspectHtmlUrl("gc://AS05B_FMC_1?INIT::RTE\n&X=1");
  assert.equal(r.ok, false);
  assert.equal(r.code, "control_chars");
});

// --- validateEventName ---

test("accepts canonical K-event names", () => {
  assert.equal(validateEventName("AP_MASTER").ok, true);
  assert.equal(validateEventName("THROTTLE_SET").ok, true);
  assert.equal(validateEventName("VIEW_CAMERA_SELECT_2").ok, true);
});

test("accepts third-party event reference forms", () => {
  assert.equal(validateEventName("#1234").ok, true);
  assert.equal(validateEventName("#0x04A2").ok, true);
});

test("rejects event names containing a period (not recognized by MSFS)", () => {
  const r = validateEventName("Custom.Event");
  assert.equal(r.ok, false);
  assert.equal(r.code, "period_in_name");
});

test("rejects lowercase / malformed event names", () => {
  assert.equal(validateEventName("ap_master").ok, false);
  assert.equal(validateEventName("2FAST").ok, false);
  assert.equal(validateEventName("has space").ok, false);
  assert.equal(validateEventName("").ok, false);
});

test("blocks destructive / session-ending events", () => {
  const r = validateEventName("SIM_RESET");
  assert.equal(r.ok, false);
  assert.equal(r.code, "blocked");
  assert.equal(validateEventName("QUIT").code, "blocked");
});

// --- validateEventData ---

test("event data defaults to 0 when omitted", () => {
  assert.equal(validateEventData(undefined).data, 0);
  assert.equal(validateEventData(null).data, 0);
});

test("event data accepts integers in 32-bit range", () => {
  assert.equal(validateEventData(6554).data, 6554);
  assert.equal(validateEventData(-1).data, -1);
  assert.equal(validateEventData(30000).data, 30000);
});

test("event data rejects non-integers and out-of-range values", () => {
  assert.equal(validateEventData(1.5).ok, false);
  assert.equal(validateEventData(NaN).ok, false);
  assert.equal(validateEventData("5").ok, false);
  assert.equal(validateEventData(5000000000).ok, false);
});

// --- buildSetSimVarUrl ---

test("buildSetSimVarUrl builds a valid numeric SETSIMVAR url", () => {
  const r = buildSetSimVarUrl("L:XMLVAR_NON_NORMAL_DRIVE_FAILURE_1", 1, "number");
  assert.equal(r.ok, true);
  assert.equal(r.url, "gc://SETSIMVAR?L%3AXMLVAR_NON_NORMAL_DRIVE_FAILURE_1=1&unit=number");
  assert.equal(r.name, "L:XMLVAR_NON_NORMAL_DRIVE_FAILURE_1");
  assert.equal(r.value, "1");
  assert.equal(r.unit, "number");
});

test("buildSetSimVarUrl defaults unit to number", () => {
  const r = buildSetSimVarUrl("L:FOO", 0);
  assert.equal(r.ok, true);
  assert.match(r.url, /&unit=number$/);
});

test("buildSetSimVarUrl handles a var name with spaces and index", () => {
  const r = buildSetSimVarUrl("ELEVATOR POSITION", 0.08, "Position");
  assert.equal(r.ok, true);
  assert.equal(r.url, "gc://SETSIMVAR?ELEVATOR%20POSITION=0.08&unit=Position");
});

test("buildSetSimVarUrl accepts string values and encodes injection chars", () => {
  const r = buildSetSimVarUrl("L:SOME_STRING", "A&B=C");
  assert.equal(r.ok, true);
  // '&' and '=' in the value must be encoded so they can't inject query params.
  assert.match(r.url, /A%26B%3DC/);
  assert.ok(!/A&B=C/.test(r.url));
});

test("buildSetSimVarUrl rejects bad names, missing/invalid values, control chars", () => {
  assert.equal(buildSetSimVarUrl("", 1).ok, false);
  assert.equal(buildSetSimVarUrl("bad$name", 1).code, "bad_name");
  assert.equal(buildSetSimVarUrl("L:FOO").code, "missing_value");
  assert.equal(buildSetSimVarUrl("L:FOO", Infinity).code, "invalid_value");
  assert.equal(buildSetSimVarUrl("L:FOO", {}).code, "invalid_value");
  assert.equal(buildSetSimVarUrl("bad\nname", 1).code, "control_chars");
});

test("buildSetSimVarUrl enforces the 2048-char URL limit", () => {
  const r = buildSetSimVarUrl("L:FOO", "X".repeat(MAX_INSPECT_HTML_URL_LEN));
  assert.equal(r.ok, false);
  assert.equal(r.code, "too_long");
});
