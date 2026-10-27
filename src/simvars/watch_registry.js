// Dynamic SimVar watch registry
//
// Clients can register arbitrary SimVars / L:Vars at runtime to be polled by
// the SimConnect poller alongside the static registry. Each watched var gets a
// stable SimConnect data-definition ID and request ID drawn from a dedicated
// high ID space so it never collides with the static registry (which uses
// defID 0..N-1 and requestID 1000..1000+N-1).

const DATA_TYPE_FLOAT64 = 4;
const DATA_TYPE_INT32 = 1;

// Base IDs for dynamic watches. Chosen well above the static registry's range
// (the static set uses requestID 1000..~1270). 100000 leaves ample headroom.
const WATCH_DEF_ID_BASE = 100000;
const WATCH_REQUEST_ID_BASE = 100000;

// The MCP "category" under which watched values are cached in StateManager.
const WATCH_CATEGORY = "watched";

const VALID_DATA_TYPES = new Set(["float64", "int32"]);

// SimVar names are uppercase tokens, optionally an "L:"/"A:"/"E:" prefix, with
// spaces, digits, colons (indexers like :1), and a few punctuation chars.
// Reject control characters and anything that could break the binary protocol
// payload (which is a fixed 256-byte UTF-8 field).
const SIMVAR_NAME_RE = /^[A-Za-z0-9 _:.\-]+$/;
const MAX_NAME_BYTES = 255; // leave room for the null terminator in the 256-byte field

function normalizeName(name) {
  return String(name == null ? "" : name).trim();
}

/**
 * Validate a SimVar name for use as a data-definition datum name.
 * Returns { ok: true, name } or { ok: false, error }.
 */
function validateSimVarName(rawName) {
  const name = normalizeName(rawName);
  if (!name) return { ok: false, error: "SimVar name is required." };
  if (Buffer.byteLength(name, "utf8") > MAX_NAME_BYTES) {
    return { ok: false, error: `SimVar name exceeds ${MAX_NAME_BYTES} bytes.` };
  }
  if (!SIMVAR_NAME_RE.test(name)) {
    return { ok: false, error: "SimVar name contains invalid characters. Allowed: A-Z, 0-9, space, _ : . -" };
  }
  return { ok: true, name };
}

function normalizeDataType(rawType) {
  const t = String(rawType == null ? "float64" : rawType).trim().toLowerCase();
  if (!VALID_DATA_TYPES.has(t)) return null;
  return t;
}

class WatchRegistry {
  constructor() {
    // name -> { name, unit, dataType ("float64"|"int32"), scDataType (4|1),
    //           defID, requestID, registered (bool), addedAt }
    this._watches = new Map();
    this._nextSlot = 0;
    // Set by the poller when a watch has been added to the SimConnect data
    // definition on the live connection, so we re-register after reconnects.
    this._onRegister = null;
  }

  /** Category name used in StateManager for watched values. */
  get category() {
    return WATCH_CATEGORY;
  }

  /**
   * Register a new watch (idempotent per name).
   * Returns { ok, created, watch } or { ok: false, error }.
   */
  add({ name, unit, dataType } = {}) {
    const nameCheck = validateSimVarName(name);
    if (!nameCheck.ok) return { ok: false, error: nameCheck.error };

    const type = normalizeDataType(dataType);
    if (!type) {
      return { ok: false, error: "dataType must be 'float64' or 'int32'." };
    }

    const resolvedUnit = normalizeName(unit) || (type === "int32" ? "number" : "number");
    const existing = this._watches.get(nameCheck.name);
    if (existing) {
      return { ok: true, created: false, watch: this._public(existing) };
    }

    const slot = this._nextSlot++;
    const watch = {
      name: nameCheck.name,
      unit: resolvedUnit,
      dataType: type,
      scDataType: type === "int32" ? DATA_TYPE_INT32 : DATA_TYPE_FLOAT64,
      defID: WATCH_DEF_ID_BASE + slot,
      requestID: WATCH_REQUEST_ID_BASE + slot,
      registered: false,
      addedAt: Date.now(),
    };
    this._watches.set(watch.name, watch);
    return { ok: true, created: true, watch: this._public(watch) };
  }

  /** Remove a watch by name. Returns true if it existed. */
  remove(name) {
    const key = normalizeName(name);
    return this._watches.delete(key);
  }

  /** Remove all watches. Returns the count removed. */
  clear() {
    const n = this._watches.size;
    this._watches.clear();
    return n;
  }

  has(name) {
    return this._watches.has(normalizeName(name));
  }

  get(name) {
    return this._watches.get(normalizeName(name));
  }

  /** Internal full list of watch records. */
  all() {
    return Array.from(this._watches.values());
  }

  /** Public (serializable) list for MCP responses. */
  list() {
    return this.all().map((w) => this._public(w));
  }

  /** Look up a watch record by its SimConnect requestID. */
  byRequestID(requestID) {
    for (const w of this._watches.values()) {
      if (w.requestID === requestID) return w;
    }
    return null;
  }

  markRegistered(name, value = true) {
    const w = this._watches.get(normalizeName(name));
    if (w) w.registered = value;
  }

  /** Mark every watch as not-yet-registered (e.g. after a reconnect). */
  resetRegistration() {
    for (const w of this._watches.values()) w.registered = false;
  }

  _public(w) {
    return {
      name: w.name,
      unit: w.unit,
      dataType: w.dataType,
      defID: w.defID,
      requestID: w.requestID,
      registered: w.registered,
      addedAt: new Date(w.addedAt).toISOString(),
    };
  }
}

module.exports = {
  WatchRegistry,
  validateSimVarName,
  normalizeDataType,
  WATCH_CATEGORY,
  WATCH_DEF_ID_BASE,
  WATCH_REQUEST_ID_BASE,
  DATA_TYPE_FLOAT64,
  DATA_TYPE_INT32,
};
