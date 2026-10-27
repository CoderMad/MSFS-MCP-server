// Thread-safe state cache for polled SimVar data
class StateManager {
  constructor() {
    this._state = {};      // { category: { varName: value } }
    this._lastUpdated = 0; // timestamp
    this._simClient = null;  // set by main when connected
    this._nextEventID = 1000; // counter for event IDs
    this._debugLog = []; // last N debug messages
  }

  update(category, varName, value) {
    if (!this._state[category]) this._state[category] = {};
    this._state[category][varName] = value;
    this._lastUpdated = Date.now();
  }

  getCategory(category) {
    return { ...(this._state[category] || {}) };
  }

  getAll() {
    const result = {};
    for (const [cat, vars] of Object.entries(this._state)) {
      result[cat] = { ...vars };
    }
    return result;
  }

  lastUpdated() {
    return this._lastUpdated;
  }

  isStale(thresholdMs = 5000) {
    return this._lastUpdated === 0 || (Date.now() - this._lastUpdated) > thresholdMs;
  }

  addDebug(msg) {
    this._debugLog.push({ t: Date.now(), msg });
    if (this._debugLog.length > 20) this._debugLog.shift();
  }
}

module.exports = { StateManager };



