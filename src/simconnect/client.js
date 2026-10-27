// SimConnect Binary TCP Protocol for MSFS Pro Edition
// Port from flightsim-mcp Go implementation to Node.js
const net = require("net");
const { Buffer } = require("buffer");
const { EventEmitter } = require("events");

// Protocol constants (KittyHawk / MSFS 2024 / Pro Edition)
const SEND_HEADER_SIZE = 16;
const RECV_HEADER_SIZE = 12;
const PROTOCOL_VERSION = 0x05;
const SEND_TYPE_MASK = 0xf0000000;

// Send message types
const SEND_OPEN = 0x01;
const SEND_CLOSE = 0x02;
const SEND_ADD_TO_DATA_DEF = 0x0c;
const SEND_REQUEST_DATA = 0x0e;

// InspectHTML
const SEND_INSPECT_HTML = 0x60; // function index 92 + offset 4
const RECV_HTML_DATA = 10001;   // SIMCONNECT_RECV_ID_RAYCAST=10000, HTML_DATA is next

// Event sending
const SEND_MAP_CLIENT_EVENT = 0x04;
const SEND_TRANSMIT_CLIENT_EVENT = 0x05;

// Receive message types
const RECV_EXCEPTION = 0x01;
const RECV_OPEN = 0x02;
const RECV_SIM_OBJECT_DATA = 0x08;

// KittyHawk OPEN version constants
const KH_MAJOR = 11;
const KH_MINOR = 0;
const KH_BUILD_MAJOR = 62651;
const KH_BUILD_MINOR = 3;
const KH_ALIAS = "HK";

function encodeSendHeader(msgType, msgID, payloadSize) {
  const buf = Buffer.alloc(SEND_HEADER_SIZE);
  buf.writeUInt32LE(SEND_HEADER_SIZE + payloadSize, 0);
  buf.writeUInt32LE(PROTOCOL_VERSION, 4);
  buf.writeUInt32LE((msgType | SEND_TYPE_MASK) >>> 0, 8);
  buf.writeUInt32LE(msgID, 12);
  return buf;
}

function decodeRecvHeader(data) {
  if (data.length < RECV_HEADER_SIZE) {
    throw new Error(`Header too short: got ${data.length} bytes, need ${RECV_HEADER_SIZE}`);
  }
  return {
    size: data.readUInt32LE(0),
    version: data.readUInt32LE(4),
    type: data.readUInt32LE(8),
  };
}

class SimConnectClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = {
      host: config.host || "127.0.0.1",
      port: config.port || 500,
      timeout: config.timeout || 10000,
      appName: config.appName || "msfs-pro-mcp",
    };
    this.socket = null;
    this.connected = false;
    this.nextID = 0;
    this._recvBuffer = Buffer.alloc(0);
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(this.config.timeout);

      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("SimConnect connection timeout"));
      });

      socket.on("error", (err) => {
        this.connected = false;
        this.emit("error", err);
        reject(err);
      });

      socket.on("close", () => {
        this.connected = false;
        this.emit("disconnected");
      });

      socket.on("data", (chunk) => this._onData(chunk));

      socket.connect(this.config.port, this.config.host, () => {
        this.socket = socket;
        this._sendOpen()
          .then(() => {
            this.connected = true;
            this.emit("connected");
            resolve();
          })
          .catch(reject);
      });
    });
  }

  close() {
    if (!this.socket) return;
    try { this._sendMessageSync(SEND_CLOSE, Buffer.alloc(0)); } catch {}
    this.socket.destroy();
    this.socket = null;
    this.connected = false;
  }

  async _sendOpen() {
    // KittyHawk OPEN payload: 280 bytes
    const payload = Buffer.alloc(280);
    payload.write(this.config.appName, 0, 256, "utf8"); // 256-byte app name
    // 4 bytes reserved (0), 1 byte separator (0x00), 3 byte alias "HK\0"
    payload.writeUInt32LE(0, 256);
    payload.writeUInt8(0x00, 260);
    payload.write(KH_ALIAS, 261, 2, "utf8");
    payload.writeUInt8(0x00, 263);
    // Version fields
    payload.writeUInt32LE(KH_MAJOR, 264);
    payload.writeUInt32LE(KH_MINOR, 268);
    payload.writeUInt32LE(KH_BUILD_MAJOR, 272);
    payload.writeUInt32LE(KH_BUILD_MINOR, 276);

    return this._sendMessage(SEND_OPEN, payload);
  }

  async addToDataDefinition(defID, datumName, unitsName, dataType) {
    // Payload: 528 bytes
    const payload = Buffer.alloc(528);
    payload.writeUInt32LE(defID, 0);
    payload.write(datumName, 4, 256, "utf8");
    payload.write(unitsName, 260, 256, "utf8");
    payload.writeUInt32LE(dataType, 516); // 4=FLOAT64, 1=INT32
    payload.writeFloatLE(0.0, 520); // epsilon
    payload.writeUInt32LE(0xffffffff, 524); // datumId UNUSED
    return this._sendMessage(SEND_ADD_TO_DATA_DEF, payload);
  }

  async requestData(defID, objectID, requestID) {
    const payload = Buffer.alloc(32);
    payload.writeUInt32LE(requestID, 0);
    payload.writeUInt32LE(defID, 4);
    payload.writeUInt32LE(objectID, 8);
    payload.writeUInt32LE(1, 12); // PERIOD_ONCE
    // flags=0, origin=0, interval=0, limit=0 (already zeroed)
    return this._sendMessage(SEND_REQUEST_DATA, payload);
  }

  async inspectHTML(url) {
    // Payload: null-terminated URL string, padded to fill (max 2048)
    const urlBytes = Buffer.from(url, "utf8");
    const payload = Buffer.alloc(urlBytes.length + 1); // +1 for null terminator
    urlBytes.copy(payload);
    payload[urlBytes.length] = 0;
    return this._sendMessage(SEND_INSPECT_HTML, payload);
  }

  async mapClientEventToSimEvent(eventID, eventName) {
    // Payload: 260 bytes  int32 eventID + char[256] eventName
    const payload = Buffer.alloc(260);
    payload.writeUInt32LE(eventID, 0);
    payload.write(eventName, 4, 256, "utf8");
    return this._sendMessage(SEND_MAP_CLIENT_EVENT, payload);
  }

  async transmitClientEvent(objectID, eventID, data, groupID, flags) {
    // Payload: 20 bytes — 5 x int32
    const payload = Buffer.alloc(20);
    payload.writeUInt32LE(objectID, 0);    // SIMCONNECT_OBJECT_ID_USER = 0
    payload.writeUInt32LE(eventID, 4);
    payload.writeUInt32LE(data || 0, 8);
    payload.writeUInt32LE(groupID || 0, 12);  // SIMCONNECT_GROUP_PRIORITY_HIGHEST = 1
    payload.writeUInt32LE(flags || 0x10, 16); // SIMCONNECT_EVENT_FLAG_GROUPID_IS_PRIORITY = 0x10
    return this._sendMessage(SEND_TRANSMIT_CLIENT_EVENT, payload);
  }

  async _sendMessage(msgType, payload) {
    if (!this.socket) throw new Error("Not connected");
    const id = ++this.nextID;
    const header = encodeSendHeader(msgType, id, payload.length);
    return new Promise((resolve, reject) => {
      this.socket.write(Buffer.concat([header, payload]), (err) => {
        if (err) reject(err); else resolve(id);
      });
    });
  }

  _sendMessageSync(msgType, payload) {
    if (!this.socket) return;
    const id = ++this.nextID;
    const header = encodeSendHeader(msgType, id, payload.length);
    this.socket.write(Buffer.concat([header, payload]));
  }

  _onData(chunk) {
    this._recvBuffer = Buffer.concat([this._recvBuffer, chunk]);
    while (this._recvBuffer.length >= RECV_HEADER_SIZE) {
      const header = decodeRecvHeader(this._recvBuffer);
      if (this._recvBuffer.length < header.size) break; // incomplete message
      const payload = this._recvBuffer.subarray(RECV_HEADER_SIZE, header.size);
      this._recvBuffer = this._recvBuffer.subarray(header.size);
      this._handleMessage(header, payload);
    }
  }

  _handleMessage(header, payload) {
    switch (header.type) {
      case RECV_OPEN:
        this.emit("simconnect:open", payload);
        break;
      case RECV_SIM_OBJECT_DATA:
        this._handleSimObjectData(payload);
        break;
      case RECV_EXCEPTION:
        this.emit("simconnect:exception", payload);
        break;
      case RECV_HTML_DATA:
        this._handleHtmlData(payload);
        break;
      default:
        process.stderr.write("[simconnect] Unknown recv type: " + header.type + " (0x" + header.type.toString(16) + ") payload=" + payload.length + " bytes\n");
        this.emit("simconnect:debug", "Unknown recv type: " + header.type + " (0x" + header.type.toString(16) + ") payload=" + payload.length);
        this.emit("simconnect:unknown", header.type, payload);
    }
  }

  _handleHtmlData(payload) {
    process.stderr.write("[simconnect] HTML_DATA received, payload=" + payload.length + " bytes\n");
    // SIMCONNECT_RECV_HTML_DATA: extends SIMCONNECT_RECV (no extra header fields)
    // The payload after the 12-byte recv header is just the STRINGV jsonResult
    // which is a null-terminated UTF-8 string
    const str = payload.toString("utf8").replace(/\0+$/, "");
    this.emit("simconnect:htmldata", str);
  }

  _handleSimObjectData(payload) {
    // SIMCONNECT_RECV_SIMOBJECT_DATA layout (after 12-byte recv header):
    //   dwRequestID(4), dwObjectID(4), dwDefineID(4), dwFlags(4),
    //   dwentrynumber(4), dwoutof(4), dwDefineCount(4), dwData(variable)
    // Data starts at offset 28 in the payload.
    if (payload.length < 28) return;
    const requestID = payload.readUInt32LE(0);
    const objectID = payload.readUInt32LE(4);
    const defID = payload.readUInt32LE(8);
    const flags = payload.readUInt32LE(12);
    const entryNumber = payload.readUInt32LE(16);
    const outOf = payload.readUInt32LE(20);
    const defineCount = payload.readUInt32LE(24);
    const data = payload.subarray(28);
    this.emit("simconnect:data", { requestID, objectID, defID, flags, entryNumber, outOf, defineCount, data });
  }
}

// Data types
const DATA_TYPE_INT32 = 1;
const DATA_TYPE_FLOAT64 = 4;

function parseFloat64(buf, offset) {
  return buf.readDoubleLE(offset);
}

function parseInt32(buf, offset) {
  return buf.readInt32LE(offset);
}

module.exports = {
  SEND_INSPECT_HTML,
  RECV_HTML_DATA,
  SEND_MAP_CLIENT_EVENT,
  SEND_TRANSMIT_CLIENT_EVENT,
  SimConnectClient,
  DATA_TYPE_INT32,
  DATA_TYPE_FLOAT64,
  parseFloat64,
  parseInt32,
  RECV_SIM_OBJECT_DATA,
  RECV_OPEN,
  RECV_EXCEPTION,
};





