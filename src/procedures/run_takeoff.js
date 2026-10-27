#!/usr/bin/env node
// B737 MAX 8 Takeoff Sequence Runner v4.4.0
// Uses FFI bridge for input events + SETSIMVAR, TCP SimConnect for K-events + polling
// v4.4.0: Pitch-tracking elevator control loop (target 10-15 deg) during initial climb

const fb = require("../simconnect/ffi_bridge.js");
const { SimConnectClient, parseFloat64, DATA_TYPE_FLOAT64 } = require("../simconnect/client.js");

const SIMCONNECT_HOST = "127.0.0.1";
const SIMCONNECT_PORT = 500;

let V1 = 136, VR = 136, V2 = 144;
let THR_RED_ALT = 1300;
let AP_ENGAGE_ALT = 2300;
let CRUISE_ALT = 25000;

let simClient = null;
let nextEventID = 5000;

// Pitch control parameters
const PITCH_TARGET = 12.5;   // Target pitch (midpoint of 10-15 band)
const PITCH_MIN = 10;        // Lower limit
const PITCH_MAX = 15;        // Upper limit
const ELEV_INITIAL = 0.08;   // Initial rotation elevator value
const ELEV_MIN = 0;          // Min elevator (no nose-down during climb)
const ELEV_MAX = 0.20;       // Max elevator (safety cap)
const PITCH_KP = 0.005;        // Proportional gain: elevator units per degree of pitch error
const PITCH_POLL_MS = 100;   // Pitch control loop interval

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) {
  const ts = new Date().toISOString().substr(11, 12);
  console.log(`[${ts}] ${msg}`);
}

async function sendEvent(name, data) {
  const eid = nextEventID++;
  await simClient.mapClientEventToSimEvent(eid, name);
  await simClient.transmitClientEvent(0, eid, data || 0, 1, 0x10);
  log(`  K-event: ${name} data=${data || 0}`);
}

async function setSIMVAR(url) {
  try { await fb.inspectHTML(url, 500); } catch {}
  log(`  SETSIMVAR: ${url.split("?")[1]}`);
}

// Quiet version for control loop (no log spam)
async function setSIMVARQuiet(url) {
  try { await fb.inspectHTML(url, 500); } catch {}
}

let defCounter = 0;
const pendingReads = new Map();

async function readSimVar(name, unit) {
  return new Promise((resolve, reject) => {
    const defId = defCounter++;
    const reqId = 9000 + defId;
    const timeout = setTimeout(() => {
      pendingReads.delete(reqId);
      reject(new Error("readSimVar timeout: " + name));
    }, 5000);
    pendingReads.set(reqId, { resolve, reject, timeout });
    simClient.addToDataDefinition(defId, name, unit || "number", DATA_TYPE_FLOAT64)
      .then(() => simClient.requestData(defId, 0, reqId))
      .catch(reject);
  });
}

async function main() {
  log("=== B737 MAX 8 TAKEOFF SEQUENCE v4.4.0 ===");
  log("    Pitch-tracking elevator control (10-15 deg band)");
  log("");

  // Connect TCP SimConnect
  log("Connecting TCP SimConnect...");
  simClient = new SimConnectClient({ host: SIMCONNECT_HOST, port: SIMCONNECT_PORT, timeout: 10000, appName: "takeoff-runner" });
  simClient.on("simconnect:data", ({ requestID, data }) => {
    const pending = pendingReads.get(requestID);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingReads.delete(requestID);
      pending.resolve(parseFloat64(data, 0));
    }
  });
  simClient.on("error", (err) => log("SimConnect error: " + err.message));
  await simClient.connect();
  log("TCP SimConnect connected");

  // Open FFI bridge
  log("Opening FFI bridge...");
  fb.open();
  log("FFI bridge ready");

  // Read V-speeds
  log("");
  log("--- Reading flight parameters ---");
  try {
    V1 = await readSimVar("L:AIRLINER_V1_SPEED", "Knots");
    VR = await readSimVar("L:AIRLINER_VR_SPEED", "Knots");
    V2 = await readSimVar("L:AIRLINER_V2_SPEED", "Knots");
    THR_RED_ALT = await readSimVar("L:AIRLINER_THR_RED_ALT", "number");
    AP_ENGAGE_ALT = THR_RED_ALT + 1000;
  } catch (e) {
    log("Warning: Using defaults — " + e.message);
  }
  log(`V1=${V1} VR=${VR} V2=${V2} THR_RED=${THR_RED_ALT} AP_ALT=${AP_ENGAGE_ALT}`);

  // Enumerate input events
  log("");
  log("--- Enumerating input events ---");
  const cache = await fb.enumerateInputEvents(10000);
  log(`Cached ${cache.size} input events`);

  // === PREFLIGHT ===
  log("");
  log("=== PREFLIGHT ===");

  log("[1] Release parking brake");
  await sendEvent("PARKING_BRAKES");
  await sleep(100);

  log("[2] FD1 ON");
  await fb.pressInputEvent("FCC_FD_1", cache, 100);
  log("  InputEvent: FCC_FD_1");
  await sleep(300);

  log("[3] FD2 ON");
  await fb.pressInputEvent("FCC_FD_2", cache, 100);
  log("  InputEvent: FCC_FD_2");
  await sleep(300);

  log("[4] Arm LNAV");
  await fb.pressInputEvent("FCC_LNAV", cache, 100);
  log("  InputEvent: FCC_LNAV");
  await sleep(100);

  log("[5] Arm VNAV");
  await fb.pressInputEvent("FCC_VNAV", cache, 100);
  log("  InputEvent: FCC_VNAV");
  await sleep(100);

  log("[6] Bank angle 25 deg");
  await fb.pressInputEvent("FCC_BANK_ANGLE_SEL", cache, 100, 3);
  log("  InputEvent: FCC_BANK_ANGLE_SEL value=3 (25 deg)");
  await sleep(300);

  log("[7] MCP altitude " + CRUISE_ALT);
  await fb.pressInputEvent("FCC_ALTITUDE_SEL", cache, 100, CRUISE_ALT);
  log("  InputEvent: FCC_ALTITUDE_SEL value=" + CRUISE_ALT);
  await sleep(100);

  // === TAKEOFF ===
  log("");
  log("=== TAKEOFF ===");

  log("[8] Throttle 40%");
  await sendEvent("THROTTLE_SET", 6554);
  await sleep(3000);

  log("[9] TOGA thrust");
  await sendEvent("THROTTLE_FULL");
  await sleep(1000);

  log("[10] Monitoring to VR (" + VR + " kts)...");
  while (true) {
    try {
      const ias = await readSimVar("AIRSPEED INDICATED", "knots");
      if (ias >= VR) { log("  *** VR *** IAS=" + ias.toFixed(1)); break; }
    } catch {}
    await sleep(100);
  }

  log("[11] ROTATE — elevator +" + ELEV_INITIAL);
  await setSIMVAR("gc://SETSIMVAR?ELEVATOR POSITION=" + ELEV_INITIAL + "&unit=Position");

  log("[12] Waiting for positive rate (VS > 500)...");
  while (true) {
    try {
      const vs = await readSimVar("VERTICAL SPEED", "feet per minute");
      if (vs > 500) { log("  Positive rate VS=" + vs.toFixed(0) + " — GEAR UP"); await sendEvent("GEAR_UP"); break; }
    } catch {}
    await sleep(100);
  }

  // === PITCH-TRACKING CLIMB (Steps 13-14) ===
  log("[13] Pitch-tracking elevator control: target " + PITCH_MIN + "-" + PITCH_MAX + " deg");
  log("     Climbing to altitude gate: " + AP_ENGAGE_ALT + " ft AGL");

  let currentElev = ELEV_INITIAL;
  let gateReached = false;

  while (!gateReached) {
    try {
      // Read pitch and altitude
      const pitch = await readSimVar("PLANE PITCH DEGREES", "degrees");
      const agl = await readSimVar("PLANE ALT ABOVE GROUND", "feet");

      // Check altitude gate
      if (agl >= AP_ENGAGE_ALT) {
        log("  *** ALTITUDE GATE *** AGL=" + agl.toFixed(0) + " pitch=" + pitch.toFixed(1) + " elev=" + currentElev);
        gateReached = true;
        break;
      }

      // Proportional pitch control
      // Pitch in MSFS: positive = nose up
      // MSFS: negative pitch = nose up, so negate for our convention (positive = nose up)
      const actualPitch = -pitch;
      const pitchError = PITCH_TARGET - actualPitch;  // positive = need more nose-up
      const adjustment = Math.round(pitchError * PITCH_KP);
      let newElev = currentElev + adjustment;

      // Clamp
      newElev = Math.max(ELEV_MIN, Math.min(ELEV_MAX, newElev));

      // Only send update if meaningful change (avoid flooding)
      if (Math.abs(newElev - currentElev) >= 0.003) {
        currentElev = newElev;
        await setSIMVARQuiet("gc://SETSIMVAR?ELEVATOR POSITION=" + currentElev + "&unit=Position");
      }

      // Status every ~2s (every 4th iteration)
      if (Math.floor(agl) % 100 < 30) {
        process.stderr.write("  pitch=" + pitch.toFixed(1) + " elev=" + currentElev + " AGL=" + agl.toFixed(0) + "\r");
      }
    } catch {}
    await sleep(PITCH_POLL_MS);
  }

  // Step 14a: Neutralize elevator
  log("  [14a] Neutralize elevator");
  await setSIMVAR("gc://SETSIMVAR?ELEVATOR POSITION=0&unit=Position");
  await sleep(100);

  // Step 14b: Engage AP
  log("  [14b] Engage AP");
  await sendEvent("AP_MASTER");
  await sleep(1000);

  // Step 14c-e: Retract flaps sequentially
  log("  [14c] Flaps 5 → 2");
  await sendEvent("FLAPS_DECR");
  await sleep(3000);

  log("  [14d] Flaps 2 → 1");
  await sendEvent("FLAPS_DECR");
  await sleep(3000);

  log("  [14e] Flaps 1 → UP");
  await sendEvent("FLAPS_DECR");
  await sleep(2000);

  // === VERIFY ===
  log("");
  log("=== VERIFICATION ===");
  try { const v = await readSimVar("L:AP_LNAV_ACTIVE", "boolean"); log("[15] LNAV: " + (v ? "ACTIVE" : "inactive")); } catch { log("[15] LNAV: read error"); }
  try { const v = await readSimVar("L:AP_VNAV_ACTIVE", "boolean"); log("[16] VNAV: " + (v ? "ACTIVE" : "inactive")); } catch { log("[16] VNAV: read error"); }
  try { const v = await readSimVar("FLAPS HANDLE INDEX", "number"); log("[17] Flaps: " + v + (v === 0 ? " (UP)" : "")); } catch { log("[17] Flaps: read error"); }
  try { const v = await readSimVar("AUTOPILOT MASTER", "bool"); log("     AP: " + (v ? "ENGAGED" : "OFF")); } catch {}
  try { const v = await readSimVar("PLANE PITCH DEGREES", "degrees"); log("     Pitch: " + v.toFixed(1) + " deg"); } catch {}

  log("");
  log("=== TAKEOFF COMPLETE ===");
  fb.close();
  process.exit(0);
}

main().catch(e => { console.error("FATAL:", e); try { fb.close(); } catch {} process.exit(1); });
