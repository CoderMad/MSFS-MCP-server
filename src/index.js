#!/usr/bin/env node
// MSFS Pro Edition MCP Server  Entry Point
// Connects to SimConnect via TCP and exposes aircraft state as MCP tools

const { SimConnectClient, parseFloat64, parseInt32, DATA_TYPE_FLOAT64 } = require("./simconnect/client");
const { StateManager } = require("./state/manager");
const { createMcpServer } = require("./mcp/server");
const { getAllSimVars } = require("./simvars/registry");
const { WatchRegistry } = require("./simvars/watch_registry");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const SIMCONNECT_HOST = process.env.SIMCONNECT_HOST || "127.0.0.1";
const SIMCONNECT_PORT = parseInt(process.env.SIMCONNECT_PORT || "500", 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL || "500", 10);
const RECONNECT_INTERVAL_MS = 5000;

const stateManager = new StateManager();
const allVars = getAllSimVars();
const watchRegistry = new WatchRegistry();

// --- SimConnect Poller ---

let simClient = null;
let pollTimer = null;
let defID = 0;
const REQUEST_ID_BASE = 1000;

async function connectAndPoll() {
  simClient = new SimConnectClient({
    host: SIMCONNECT_HOST,
    port: SIMCONNECT_PORT,
    timeout: 10000,
    appName: "msfs-pro-mcp",
  });

  simClient.on("error", (err) => {
    process.stderr.write(`[msfs-pro-mcp] SimConnect error: ${err.message}\n`);
  });

  simClient.on("disconnected", () => {
    process.stderr.write("[msfs-pro-mcp] SimConnect disconnected. Reconnecting...\n");
    stopPolling();
    scheduleReconnect();
  });

  simClient.on("simconnect:data", ({ requestID, defID: rDefID, data }) => {
    // Static registry: requestID in [REQUEST_ID_BASE, REQUEST_ID_BASE + N)
    const varIndex = requestID - REQUEST_ID_BASE;
    if (varIndex >= 0 && varIndex < allVars.length) {
      const varDef = allVars[varIndex];
      const value = varDef.dataType === DATA_TYPE_FLOAT64
        ? parseFloat64(data, 0)
        : parseInt32(data, 0);
      stateManager.update(varDef.category, varDef.name, value);
      return;
    }

    // Dynamic watches live in a separate high requestID space.
    const watch = watchRegistry.byRequestID(requestID);
    if (watch) {
      const value = watch.scDataType === DATA_TYPE_FLOAT64
        ? parseFloat64(data, 0)
        : parseInt32(data, 0);
      stateManager.update(watchRegistry.category, watch.name, value);
    }
  });

  simClient.on("simconnect:debug", (msg) => {
    stateManager.addDebug(msg);
  });

  simClient.on("simconnect:exception", (payload) => {
    if (payload.length >= 4) {
      const exCode = payload.readUInt32LE(0);
      process.stderr.write(`[msfs-pro-mcp] SimConnect exception: code ${exCode}\n`);
      stateManager.addDebug("Exception code: " + exCode);
    }
  });

  try {
    await simClient.connect();
    stateManager._simClient = simClient;
    process.stderr.write(`[msfs-pro-mcp] Connected to SimConnect at ${SIMCONNECT_HOST}:${SIMCONNECT_PORT}\n`);

    // Register all SimVars as data definitions (one per var for simplicity)
    for (let i = 0; i < allVars.length; i++) {
      const v = allVars[i];
      await simClient.addToDataDefinition(i, v.name, v.unit, v.dataType);
    }
    process.stderr.write(`[msfs-pro-mcp] Registered ${allVars.length} SimVar definitions\n`);

    // Re-register any dynamic watches that were requested while disconnected
    // (or carry over across a reconnect).
    watchRegistry.resetRegistration();
    await registerPendingWatches();

    // Start polling
    startPolling();
  } catch (err) {
    process.stderr.write(`[msfs-pro-mcp] Connection failed: ${err.message}\n`);
    scheduleReconnect();
  }
}

function startPolling() {
  pollTimer = setInterval(async () => {
    if (!simClient || !simClient.connected) return;
    try {
      for (let i = 0; i < allVars.length; i++) {
        await simClient.requestData(i, 0, REQUEST_ID_BASE + i);
      }
      // Poll dynamic watches alongside the static registry.
      for (const w of watchRegistry.all()) {
        if (w.registered) {
          await simClient.requestData(w.defID, 0, w.requestID);
        }
      }
    } catch (err) {
      process.stderr.write(`[msfs-pro-mcp] Poll error: ${err.message}\n`);
    }
  }, POLL_INTERVAL_MS);
}

// Register a single dynamic watch on the live connection (idempotent). The
// SimConnect data definition persists for the life of the connection; polling
// is what actually produces values each tick.
async function registerWatch(watch) {
  if (!simClient || !simClient.connected) {
    throw new Error("SimConnect not connected; watch will register on next connect.");
  }
  await simClient.addToDataDefinition(watch.defID, watch.name, watch.unit, watch.scDataType);
  watchRegistry.markRegistered(watch.name, true);
}

// Register every watch that has not yet been added to the current connection.
async function registerPendingWatches() {
  for (const w of watchRegistry.all()) {
    if (!w.registered) {
      try {
        await registerWatch(w);
      } catch (err) {
        process.stderr.write(`[msfs-pro-mcp] Watch register failed for ${w.name}: ${err.message}\n`);
      }
    }
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function scheduleReconnect() {
  setTimeout(() => connectAndPoll(), RECONNECT_INTERVAL_MS);
}

// --- Main ---

async function main() {
  process.stderr.write("[msfs-pro-mcp] Starting MSFS Pro Edition MCP Server...\n");
  process.stderr.write(`[msfs-pro-mcp] SimConnect target: ${SIMCONNECT_HOST}:${SIMCONNECT_PORT}\n`);
  process.stderr.write(`[msfs-pro-mcp] SimVar count: ${allVars.length}\n`);

  // Expose the watch registry + live-registration hook to the MCP tools.
  stateManager._watchRegistry = watchRegistry;
  stateManager._registerWatch = registerWatch;

  // Start MCP server on stdio
  const mcpServer = createMcpServer(stateManager);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  process.stderr.write("[msfs-pro-mcp] MCP server running on stdio\n");

  // Start SimConnect connection (non-blocking  retries on failure)
  connectAndPoll();
}

main().catch((err) => {
  process.stderr.write(`[msfs-pro-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});


