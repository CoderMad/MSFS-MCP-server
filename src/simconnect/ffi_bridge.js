// SimConnect native DLL bridge via koffi FFI
const koffi = require("koffi");
const fs = require("fs");
const path = require("path");

// Resolve SimConnect.dll: bundled vendor copy > explicit override > installed SDK.
// The vendor copy keeps the server self-contained so it does not depend on a
// local MSFS Pro SDK installation.
const SC_DLL_SEARCH_PATHS = [
  path.join(__dirname, "..", "..", "vendor", "simconnect", "SimConnect.dll"),
  process.env.SIMCONNECT_DLL_PATH || null,
  process.env.MSFS_SDK_PATH ? path.join(process.env.MSFS_SDK_PATH, "SimConnect SDK", "lib", "SimConnect.dll") : null,
  "C:\\MSFS Professional Edition SDK\\SimConnect SDK\\lib\\SimConnect.dll",
  "C:\\MSFS SDK\\SimConnect SDK\\lib\\SimConnect.dll",
].filter(Boolean);

let SC_DLL_PATH = null;
for (const p of SC_DLL_SEARCH_PATHS) {
  if (fs.existsSync(p)) { SC_DLL_PATH = p; break; }
}
if (!SC_DLL_PATH) {
  process.stderr.write("[msfs-pro-mcp] WARNING: SimConnect.dll not found. Searched:\n");
  SC_DLL_SEARCH_PATHS.forEach(p => process.stderr.write("  - " + p + "\n"));
  process.stderr.write("[msfs-pro-mcp] Set MSFS_SDK_PATH env var to your SDK root directory.\n");
  SC_DLL_PATH = SC_DLL_SEARCH_PATHS[0]; // fallback, will fail on load
} else {
  process.stderr.write("[msfs-pro-mcp] SimConnect.dll found: " + SC_DLL_PATH + "\n");
}

let lib = null;
let scHandle = null;
let isOpen = false;

const RECV_ID_ENUMERATE_INPUT_EVENTS = 34;
const RECV_ID_HTML_DATA = 10001;
const DESC_SIZE = 1100;
const INPUT_EVENT_TYPE_DOUBLE = 0;
const INPUT_EVENT_TYPE_STRING = 1;

let _fnOpen = null;
let _fnClose = null;
let _fnDispatch = null;
let _fnInspectHTML = null;
let _fnEnumInputEvents = null;
let _fnSetInputEvent = null;

function ensureLoaded() {
  if (lib) return;
  lib = koffi.load(SC_DLL_PATH);
}

function fn(sig) {
  ensureLoaded();
  return lib.func(sig);
}

function open() {
  if (isOpen) return true;
  ensureLoaded();

  if (!_fnOpen) _fnOpen = fn(
    "long __stdcall SimConnect_Open(_Out_ void **phSimConnect, const char *szName, void *hWnd, unsigned int UserEventWin32, void *hEventHandle, unsigned int ConfigIndex)");

  const handleBuf = Buffer.alloc(8);
  const hr = _fnOpen(handleBuf, "msfs-pro-mcp-ffi", null, 0, null, 0);
  if (hr !== 0) throw new Error("SimConnect_Open failed: HRESULT " + hr);

  scHandle = koffi.decode(handleBuf, "void *");
  isOpen = true;

  if (!_fnDispatch) _fnDispatch = fn(
    "long __stdcall SimConnect_GetNextDispatch(void *hSimConnect, _Out_ void **ppData, _Out_ unsigned int *pcbData)");
  if (!_fnInspectHTML) _fnInspectHTML = fn(
    "long __stdcall SimConnect_InspectHTML(void *hSimConnect, const char *url)");
  if (!_fnEnumInputEvents) _fnEnumInputEvents = fn(
    "long __stdcall SimConnect_EnumerateInputEvents(void *hSimConnect, unsigned int RequestID)");
  // SDK docs: SimConnect_SetInputEvent(HANDLE, uint64 Hash, DWORD cbUnitSize, PVOID Value)
  if (!_fnSetInputEvent) _fnSetInputEvent = fn(
    "long __stdcall SimConnect_SetInputEvent(void *hSimConnect, uint64_t Hash, unsigned int cbUnitSize, void *Value)");

  for (let i = 0; i < 10; i++) {
    try { _fnDispatch(scHandle, Buffer.alloc(8), Buffer.alloc(4)); } catch {}
  }
  return true;
}

function close() {
  if (!isOpen || !scHandle) return;
  try {
    if (!_fnClose) _fnClose = fn("long __stdcall SimConnect_Close(void *hSimConnect)");
    _fnClose(scHandle);
  } catch {}
  scHandle = null;
  isOpen = false;
}

function dispatch() {
  const pBuf = Buffer.alloc(8);
  const cbBuf = Buffer.alloc(4);
  const hr = _fnDispatch(scHandle, pBuf, cbBuf);
  if (hr !== 0) return null;
  const pData = koffi.decode(pBuf, "void *");
  const cbData = cbBuf.readUInt32LE(0);
  if (!pData || cbData < 12) return null;
  const raw = Buffer.from(koffi.decode(pData, koffi.types.uint8, cbData));
  return { dwID: raw.readUInt32LE(8), data: raw, cbData };
}


async function drainHTMLQueue(maxMs) {
  const start = Date.now();
  const limit = maxMs || 500;
  let drained = 0;
  while (Date.now() - start < limit) {
    try {
      const msg = dispatch();
      if (!msg) break; // nothing left
      if (msg.dwID === RECV_ID_HTML_DATA) {
        drained++;
        continue; // discard stale HTML_DATA
      }
      // non-HTML message, stop draining
      break;
    } catch { break; }
  }
  return drained;
}

async function inspectHTML(url, timeoutMs = 3000) {
  if (!isOpen) open();
  // Drain stale HTML_DATA messages before sending new request
  await drainHTMLQueue(200);
  const hr = _fnInspectHTML(scHandle, url);
  if (hr !== 0) throw new Error("SimConnect_InspectHTML failed: HRESULT " + hr);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const msg = dispatch();
      if (msg && msg.dwID === RECV_ID_HTML_DATA) {
        return msg.data.subarray(12).toString("utf8").replace(/\0+$/, "");
      }
    } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("InspectHTML timeout (" + timeoutMs + "ms)");
}


async function inspectHTMLFireAndForget(url) {
  if (!isOpen) open();
  const hr = _fnInspectHTML(scHandle, url);
  if (hr !== 0) throw new Error("SimConnect_InspectHTML failed: HRESULT " + hr);
  // Give SimConnect a moment to process
  await new Promise(r => setTimeout(r, 100));
  // Drain any pending messages
  try { dispatch(); } catch {}
  return "OK";
}
async function enumerateInputEvents(timeoutMs = 10000) {
  if (!isOpen) open();
  const hr = _fnEnumInputEvents(scHandle, 99990);
  if (hr !== 0) throw new Error("EnumerateInputEvents failed: HRESULT " + hr);

  const eventMap = new Map();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const msg = dispatch();
      if (!msg) { await new Promise(r => setTimeout(r, 30)); continue; }
      if (msg.dwID === RECV_ID_ENUMERATE_INPUT_EVENTS) {
        const buf = msg.data;
        const dwArraySize = buf.readUInt32LE(16);
        const dwEntryNumber = buf.readUInt32LE(20);
        const dwOutOf = buf.readUInt32LE(24);

        for (let i = 0; i < dwArraySize; i++) {
          const base = 28 + i * DESC_SIZE;
          if (base + 76 > buf.length) break;

          let nameEnd = base;
          while (nameEnd < base + 64 && buf[nameEnd] !== 0) nameEnd++;
          const name = buf.subarray(base, nameEnd).toString("utf8");

          // Store the SDK descriptor metadata along with the raw 8-byte LE
          // hash. SetInputEvent accepts either a double or a string depending
          // on eType; preserving it prevents sending the wrong representation.
          const hashHex = buf.subarray(base + 64, base + 72).toString("hex");
          const eType = buf.readUInt32LE(base + 72);
          const descriptor = {
            name,
            hashHex,
            eType,
            type: eType === INPUT_EVENT_TYPE_STRING ? "string" : "double",
            nodeNames: [],
          };

          // Parse NodeNames[1024] at offset 76
          const nodeStart = base + 76;
          const nodeEnd = Math.min(base + DESC_SIZE, buf.length);
          if (nodeStart < buf.length) {
            let nnEnd = nodeStart;
            while (nnEnd < nodeEnd && buf[nnEnd] !== 0) nnEnd++;
            if (nnEnd > nodeStart) {
              const nodeStr = buf.subarray(nodeStart, nnEnd).toString("utf8");
              for (const node of nodeStr.split(";")) {
                const trimmed = node.trim();
                if (trimmed.length > 0) descriptor.nodeNames.push(trimmed);
              }
            }
          }

          if (name.length > 0) eventMap.set(name, descriptor);
          for (const nodeName of descriptor.nodeNames) {
            eventMap.set(nodeName, descriptor);
          }
        }

        if (dwEntryNumber >= dwOutOf - 1) return eventMap;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 30));
  }
  if (eventMap.size > 0) return eventMap;
  throw new Error("EnumerateInputEvents timeout (" + timeoutMs + "ms)");
}

/** Convert 16-char hex (8 bytes LE) back to BigInt */
function hexToHash(hashHex) {
  const bytes = Buffer.from(hashHex, "hex");
  const lo = bytes.readUInt32LE(0);
  const hi = bytes.readUInt32LE(4);
  return (BigInt(hi) << 32n) | BigInt(lo);
}

function normalizeDescriptor(eventOrHash) {
  if (typeof eventOrHash === "string") {
    return {
      hashHex: eventOrHash,
      eType: INPUT_EVENT_TYPE_DOUBLE,
      type: "double",
    };
  }
  if (eventOrHash && typeof eventOrHash.hashHex === "string") {
    return eventOrHash;
  }
  throw new Error("Invalid input event descriptor or hash.");
}

/**
 * Set an input event using the 4-param SDK signature:
 *   SimConnect_SetInputEvent(handle, uint64 Hash, DWORD cbUnitSize, PVOID Value)
 * Value is passed as a pointer to a Buffer containing the event's SDK value.
 */
function setInputEvent(eventOrHash, value) {
  if (!isOpen) open();
  const descriptor = normalizeDescriptor(eventOrHash);
  const hashBigInt = hexToHash(descriptor.hashHex);
  let valBuf;

  if (descriptor.eType === INPUT_EVENT_TYPE_STRING || descriptor.type === "string") {
    valBuf = Buffer.from(String(value) + "\0", "utf8");
  } else {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new Error("Double input event value must be a finite number.");
    }
    valBuf = Buffer.alloc(8);
    valBuf.writeDoubleLE(numericValue, 0);
  }

  const hr = _fnSetInputEvent(scHandle, hashBigInt, valBuf.length, valBuf);
  if (hr !== 0) {
    throw new Error("SetInputEvent failed: HRESULT " + hr + " hash=0x" + descriptor.hashHex);
  }
}

async function pressInputEvent(name, cache, holdMs = 100) {
  const cached = cache.get(name);
  if (!cached) {
    throw new Error("Input event '" + name + "' not found. Cache has " + cache.size + " entries.");
  }
  const descriptor = normalizeDescriptor(cached);
  if (descriptor.eType === INPUT_EVENT_TYPE_STRING || descriptor.type === "string") {
    throw new Error("Input event '" + name + "' is string-valued and cannot be pressed as a button.");
  }
  setInputEvent(descriptor, 1.0);
  await new Promise(r => setTimeout(r, holdMs));
  setInputEvent(descriptor, 0.0);
}

module.exports = {
  open,
  close,
  inspectHTML,
  inspectHTMLFireAndForget,
  drainHTMLQueue,
  enumerateInputEvents,
  setInputEvent,
  pressInputEvent,
  INPUT_EVENT_TYPE_DOUBLE,
  INPUT_EVENT_TYPE_STRING,
};
