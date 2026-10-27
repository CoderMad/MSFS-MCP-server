#!/usr/bin/env node
// TDD Document Generator for MSFS Pro MCP Server
// Generates a professional Technical Design Document in MS Word (.docx) format
// Usage: node scripts/generate_tdd.js

const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, PageBreak, Header, Footer,
  TableOfContents, StyleLevel } = require("docx");
const fs = require("fs");
const path = require("path");

const OUTPUT_PATH = path.join(__dirname, "..", "docs", "MSFS_Pro_MCP_Server_TDD.docx");

// Ensure docs directory exists
const docsDir = path.dirname(OUTPUT_PATH);
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

// ── Helpers ──────────────────────────────────────────────────────────────────
function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
}
function h1(t) { return heading(t, HeadingLevel.HEADING_1); }
function h2(t) { return heading(t, HeadingLevel.HEADING_2); }
function h3(t) { return heading(t, HeadingLevel.HEADING_3); }

function para(text, opts = {}) {
  const runs = Array.isArray(text) ? text : [new TextRun(text)];
  return new Paragraph({ children: runs, spacing: { after: 120 }, ...opts });
}
function bold(t) { return new TextRun({ text: t, bold: true }); }
function italic(t) { return new TextRun({ text: t, italics: true }); }
function code(t) { return new TextRun({ text: t, font: "Consolas", size: 20 }); }
function run(t) { return new TextRun(t); }

function bullet(text) {
  return new Paragraph({
    children: [new TextRun(text)],
    bullet: { level: 0 },
    spacing: { after: 60 },
  });
}
function bullet2(text) {
  return new Paragraph({
    children: [new TextRun(text)],
    bullet: { level: 1 },
    spacing: { after: 40 },
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function cell(text, opts = {}) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, size: 20, ...opts })] })],
    borders: CELL_BORDERS,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
  });
}
function headerCell(text, widthPct) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, color: "FFFFFF" })] })],
    borders: CELL_BORDERS,
    shading: { fill: "2E74B5" },
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
  });
}

function simpleTable(headers, rows) {
  const hdrRow = new TableRow({ children: headers.map((h, i) => headerCell(h)) });
  const dataRows = rows.map(r => new TableRow({
    children: r.map(c => cell(c)),
  }));
  return new Table({
    rows: [hdrRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

console.log("[TDD Generator] Building document...");

// ── SECTION: Title Page ──────────────────────────────────────────────────────
const titlePage = [
  new Paragraph({ spacing: { before: 2400 } }),
  new Paragraph({
    children: [new TextRun({ text: "Technical Design Document", size: 56, bold: true, color: "2E74B5" })],
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({ spacing: { before: 200 } }),
  new Paragraph({
    children: [new TextRun({ text: "MSFS Pro Edition MCP Server", size: 44, bold: true })],
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: "@boeing737-max8/msfs-pro-mcp", size: 28, italics: true, color: "666666" })],
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({ spacing: { before: 200 } }),
  new Paragraph({
    children: [new TextRun({ text: "Unified SimConnect Gateway for B737 MAX 8 Flight Model", size: 24, color: "444444" })],
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({ spacing: { before: 600 } }),
  simpleTable(["Field", "Value"], [
    ["Document Version", "2.0.0"],
    ["Date", new Date().toISOString().slice(0, 10)],
    ["Package", "@boeing737-max8/msfs-pro-mcp"],
    ["Server Version", "2.0.0"],
    ["Classification", "Boeing Proprietary"],
    ["Platform", "Windows x64"],
    ["Runtime", "Node.js >= 18"],
    ["Target Simulator", "MSFS Professional Edition"],
    ["Aircraft", "Boeing 737 MAX 8 (AS05B)"],
  ]),
  pageBreak(),
];

// ── SECTION: Document Control ────────────────────────────────────────────────
const docControl = [
  h1("1. Document Control"),
  h2("1.1 Revision History"),
  simpleTable(["Version", "Date", "Author", "Description"], [
    ["1.0.0", "2026-09-01", "TPS-BVAT Team", "Initial TCP-only MCP server with SimVar polling"],
    ["2.0.0", "2026-09-25", "TPS-BVAT Team", "Unified architecture: TCP + FFI bridge, InspectHTML, InputEvents, CDU tools, procedure runner"],
  ]),
  para(""),
  h2("1.2 Distribution"),
  para("This document is distributed via the Boeing private npm registry (SRES Artifactory) as part of the @boeing737-max8/msfs-pro-mcp package. Access is restricted to authorized TPS-BVAT team members."),
  pageBreak(),
];

// ── SECTION: Executive Summary ───────────────────────────────────────────────
const execSummary = [
  h1("2. Executive Summary"),
  para("The MSFS Pro Edition MCP Server is a Model Context Protocol (MCP) server that acts as a unified gateway between AI-powered development tools (Kiro, VS Code, Copilot) and the Microsoft Flight Simulator Professional Edition. It enables AI agents to read aircraft state, control cockpit systems, interact with the FMC CDU, and execute automated procedures on the Boeing 737 MAX 8 flight model."),
  para(""),
  h2("2.1 Purpose"),
  bullet("Provide AI agents with real-time access to 200+ aircraft SimVars across 16 categories"),
  bullet("Enable programmatic control of cockpit systems via SimConnect events and input events"),
  bullet("Support FMC CDU page reading, navigation, and data entry for automated testing"),
  bullet("Execute pre-defined procedure sequences for preflight, takeoff, and route programming"),
  bullet("Serve as the single integration point between AI tooling and MSFS Pro Edition"),
  para(""),
  h2("2.2 Scope"),
  para("This server is specific to the Boeing 737 MAX 8 aircraft model (AS05B) running on MSFS Professional Edition. It communicates with SimConnect via two channels: TCP binary protocol for K-events and SimVar polling, and native DLL FFI for InspectHTML, InputEvents, and SETSIMVAR operations."),
  pageBreak(),
];

// ── SECTION: Architecture Overview ───────────────────────────────────────────
const architecture = [
  h1("3. System Architecture"),
  h2("3.1 High-Level Architecture"),
  para("The MCP server follows a unified single-process architecture. One Node.js process manages all SimConnect communication through two parallel channels and exposes 25+ tools via the MCP stdio transport."),
  para(""),
  para("Architecture Diagram (Text Representation):", { spacing: { after: 60 } }),
  para(""),
  new Paragraph({ children: [code("  +─────────────────────────────────────────────────────────────+")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |                    AI IDE (Kiro / VS Code)                  |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |  | get_pos   |  | read_fmc |  | fire_evt |  | run_proc  |  |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  +───────┼────────────┼────────────┼──────────────┼───────────+")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("          |            |            |              |              ")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("          v            v            v              v              ")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  +─────────────────────────────────────────────────────────────+")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |              MCP Server (stdio transport)                   |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |                  server.js v2.0.0                           |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |  | State Mgr   |  | CDU Parser   |  | CDU Navigation    |  |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |  | manager.js  |  | cdu_parser   |  | cdu_navigation    |  |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |  └──────┬──────┘  └──────┬───────┘  └────────┬──────────┘  |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  +─────────┼──────────────┼──────────────────┼────────────────+")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("            |              |                  |                  ")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("    ┌───────┴───────┐  ┌──┴──────────────────┴──────┐           ")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("    | TCP Channel   |  |     FFI Channel            |           ")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("    | client.js     |  |     ffi_bridge.js           |           ")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("    | Port 500      |  |     SimConnect.dll (koffi)  |           ")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("    └───────┬───────┘  └────────────┬────────────────┘           ")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("            |                       |                             ")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("            v                       v                             ")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  +─────────────────────────────────────────────────────────────+")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |           MSFS Professional Edition (SimConnect)            |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  |           Boeing 737 MAX 8 (AS05B Aircraft Model)           |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("  +─────────────────────────────────────────────────────────────+")], spacing: { after: 0 } }),
  para(""),
  h2("3.2 Design Principles"),
  bullet("Unified Gateway: Single process handles all SimConnect communication, eliminating race conditions between separate TCP and FFI processes"),
  bullet("Dual-Channel Communication: TCP for standardized K-events and SimVar polling; FFI for InspectHTML, InputEvents, and SETSIMVAR"),
  bullet("Lazy Initialization: FFI bridge and input event cache are initialized on first use, not at startup"),
  bullet("Fire-and-Forget Pattern: SETSIMVAR commands use a non-blocking path since they produce no response"),
  bullet("Queue Draining: Stale HTML_DATA messages are flushed before each InspectHTML request to prevent cross-contamination"),
  bullet("Automatic Reconnection: TCP client reconnects on disconnect with 5-second retry interval"),
  pageBreak(),
];

// ── SECTION: Component Design ────────────────────────────────────────────────
const componentDesign = [
  h1("4. Component Design"),

  h2("4.1 Entry Point (index.js)"),
  para("The entry point bootstraps the MCP server on stdio, connects the SimConnect TCP client, registers all SimVar data definitions, and starts the polling loop."),
  simpleTable(["Responsibility", "Detail"], [
    ["MCP Transport", "stdio (stdin/stdout) via @modelcontextprotocol/sdk"],
    ["SimConnect Connection", "TCP to SIMCONNECT_HOST:SIMCONNECT_PORT"],
    ["Polling", "Requests all registered SimVars every POLL_INTERVAL ms"],
    ["Reconnection", "Automatic retry every 5 seconds on disconnect"],
    ["State Injection", "Passes simClient reference to StateManager for event tools"],
  ]),
  para(""),

  h2("4.2 MCP Server (mcp/server.js)"),
  para("The server factory creates an McpServer instance and registers all tool handlers. Tools are organized into categories:"),
  simpleTable(["Category", "Tools", "Channel"], [
    ["Read — SimVar", "get_position, get_flight_instruments, get_autopilot, get_engines, get_fuel, get_environment, get_radio_nav, get_fmc_state, get_vnav, get_ap_modes, get_n1_thrust, get_systems, get_efis, get_hud, get_annunciations, get_rnp_anp", "TCP polling"],
    ["Read — Generic", "get_simvar, get_all_state, get_connection_status, debug_log", "State cache"],
    ["Read — CDU", "read_fmc_page, lookup_cdu_page, verify_cdu_page, navigate_cdu_page", "FFI InspectHTML"],
    ["Write — K-Events", "send_event", "TCP"],
    ["Write — FFI", "run_inspecthtml, fire_input_event", "FFI"],
    ["Write — CDU Input", "type_text, press_cdu_key", "FFI InputEvents"],
    ["Write — Win32", "send_keys", "PowerShell/Win32 API"],
    ["Control", "run_procedure", "FFI InspectHTML"],
  ]),
  para(""),

  h2("4.3 SimConnect TCP Client (simconnect/client.js)"),
  para("A pure Node.js TCP client implementing the SimConnect binary wire protocol (KittyHawk variant for MSFS Pro Edition)."),
  simpleTable(["Feature", "Implementation"], [
    ["Protocol", "Binary TCP, 16-byte send header, 12-byte receive header"],
    ["Version", "Protocol v5, KittyHawk build 62651.3"],
    ["Message Framing", "Length-prefixed with accumulation buffer for partial reads"],
    ["Data Definitions", "AddToDataDefinition with FLOAT64/INT32 types"],
    ["Event Dispatch", "MapClientEventToSimEvent + TransmitClientEvent"],
    ["Data Types", "FLOAT64 (8 bytes LE), INT32 (4 bytes LE)"],
  ]),
  para(""),

  h2("4.4 FFI Bridge (simconnect/ffi_bridge.js)"),
  para("Native DLL bridge using the koffi FFI library to call SimConnect.dll functions directly. This channel handles operations not available through the TCP protocol."),
  simpleTable(["Function", "Purpose", "Pattern"], [
    ["SimConnect_Open", "Open a separate FFI session to SimConnect", "Lazy init"],
    ["SimConnect_InspectHTML", "Send gc:// URL commands to instrument HTML", "Request/response"],
    ["SimConnect_EnumerateInputEvents", "Discover all available input events", "Cached on first use"],
    ["SimConnect_SetInputEvent", "Set input event value by hash", "Fire-and-forget"],
    ["SimConnect_GetNextDispatch", "Poll for response messages", "Busy-wait with timeout"],
  ]),
  para(""),
  para([bold("Queue Draining: "), run("Before each InspectHTML call, drainHTMLQueue() flushes any stale HTML_DATA messages from the dispatch queue. This prevents a response from a previous command from being incorrectly returned for the current request.")]),
  para(""),
  para([bold("Fire-and-Forget: "), run("SETSIMVAR commands (gc://SETSIMVAR?...) use inspectHTMLFireAndForget() which sends the command and returns immediately without waiting for a response, since SETSIMVAR produces no HTML_DATA reply.")]),
  para(""),

  h2("4.5 SimVar Registry (simvars/registry.js)"),
  para("Defines all 200+ SimVars organized into 16 categories. Each entry specifies the SimVar name, unit, and data type (FLOAT64 or INT32)."),
  simpleTable(["Category", "Description", "Variable Count"], [
    ["position", "Aircraft position, speed, attitude", "16"],
    ["flight_instruments", "PFD readings, control surfaces", "19"],
    ["autopilot", "AP modes, GPS waypoint data", "19"],
    ["engines", "Dual-engine N1/N2, EGT, oil, fuel flow", "26"],
    ["fuel", "Fuel quantities and weight", "3"],
    ["environment", "Weather, wind, temperature", "6"],
    ["radio_nav", "NAV/COM/ADF frequencies, VOR/DME", "35"],
    ["fmc_state", "FMC operational state, V-speeds, route flags", "35"],
    ["vnav", "VNAV speeds, constraints, descent state", "31"],
    ["ap_modes", "FCC settings, HDG/ALT/VS/SPD selectors", "38"],
    ["n1_thrust", "N1 thrust limits and temperatures", "7"],
    ["systems", "Hydraulics, pressurization, gear, APU", "18"],
    ["efis", "EFIS modes, ranges, map settings", "13"],
    ["hud", "Speed bugs, AP selected values", "14"],
    ["annunciations", "Master caution/warning, ATC", "11"],
    ["rnp_anp", "Navigation accuracy (RNP/ANP)", "6"],
  ]),
  para(""),

  h2("4.6 State Manager (state/manager.js)"),
  para("Thread-safe in-memory cache for polled SimVar data. Provides category-based access and staleness detection."),
  simpleTable(["Method", "Purpose"], [
    ["update(category, name, value)", "Store a polled SimVar value"],
    ["getCategory(category)", "Return shallow copy of all vars in a category"],
    ["getAll()", "Return all categories with all vars"],
    ["isStale(thresholdMs)", "Check if data is older than threshold (default 5s)"],
    ["addDebug(msg)", "Append to rolling debug log (max 20 entries)"],
  ]),
  para(""),

  h2("4.7 CDU Parser (mcp/cdu_parser.js)"),
  para("Parses InspectHTML GETALL JSON responses into structured CDU page objects. Handles HTML entity decoding, custom FMC markup stripping ([s-text], [s]...[/s]), and reconstructs a 24-column text display."),
  para(""),

  h2("4.8 CDU Navigation (mcp/cdu_navigation.js)"),
  para("Provides page routing metadata and navigation logic for CDU page transitions. Supports 13 target pages: menu, init_ref, perf_init, pos_init, takeoff_ref, rte, dep_arr, legs, hold, prog, fix, navrad, vnav."),
  pageBreak(),
];

// ── SECTION: Tool Interface Catalog ──────────────────────────────────────────
const toolCatalog = [
  h1("5. MCP Tool Interface Catalog"),
  para("The server exposes 25+ tools through the MCP protocol. Each tool is invoked by the AI agent via JSON-RPC over stdio."),
  para(""),

  h2("5.1 Read Tools — SimVar Categories (16 tools)"),
  para("Each category tool returns all cached SimVar values for that group. Tool names follow the pattern get_{category}."),
  simpleTable(["Tool Name", "Parameters", "Returns"], [
    ["get_position", "None", "Lat, lon, alt, heading, speed, vertical speed, GPS data"],
    ["get_flight_instruments", "None", "IAS, TAS, Mach, pitch, bank, control surfaces, flaps, weight"],
    ["get_autopilot", "None", "AP master, mode flags, alt/hdg/vs targets, GPS WP data"],
    ["get_engines", "None", "N1/N2, EGT, oil, fuel flow for both engines"],
    ["get_fuel", "None", "Total fuel quantity, weight per gallon, fuel used"],
    ["get_environment", "None", "Temperature, pressure, wind speed/direction"],
    ["get_radio_nav", "None", "NAV/COM/ADF frequencies, VOR/DME, transponder"],
    ["get_fmc_state", "None", "FMC state, V-speeds, route flags, perf data availability"],
    ["get_vnav", "None", "VNAV active, target speeds, constraints, descent state"],
    ["get_ap_modes", "None", "LNAV/VNAV/HDG/ALT/VS active, FCC selector values"],
    ["get_n1_thrust", "None", "N1 limits, selected temp, takeoff limit"],
    ["get_systems", "None", "Hydraulics, pressurization, gear, APU status"],
    ["get_efis", "None", "Map mode, range, mins settings"],
    ["get_hud", "None", "Speed bugs, AP selected altitude"],
    ["get_annunciations", "None", "Master caution/warning, ATC messages"],
    ["get_rnp_anp", "None", "Lateral/vertical RNP, ANP, cross-track error"],
  ]),
  para(""),

  h2("5.2 Read Tools — Generic"),
  simpleTable(["Tool", "Parameters", "Description"], [
    ["get_simvar", "name: string", "Read a specific SimVar by exact name"],
    ["get_all_state", "None", "Return all cached data across all categories"],
    ["get_connection_status", "None", "Connection status, last update time, staleness"],
    ["debug_log", "None", "Recent SimConnect debug messages and exceptions"],
  ]),
  para(""),

  h2("5.3 Read Tools — CDU"),
  simpleTable(["Tool", "Parameters", "Description"], [
    ["read_fmc_page", "cdu?: 1|2", "Read current CDU page content as structured text"],
    ["lookup_cdu_page", "targetPage: string", "Get page transition metadata for navigation"],
    ["verify_cdu_page", "targetPage: string, cdu?: 1|2", "Verify current CDU page matches target"],
    ["navigate_cdu_page", "targetPage: string, cdu?: 1|2, maxSteps?: int, stepDelayMs?: int", "Navigate to a target FMC page with verification"],
  ]),
  para(""),

  h2("5.4 Write Tools"),
  simpleTable(["Tool", "Parameters", "Description"], [
    ["send_event", "eventName: string, data?: number", "Send K-event via TCP (AP_MASTER, camera views)"],
    ["run_inspecthtml", "url: string, timeoutMs?: number", "Execute any gc:// InspectHTML URL"],
    ["fire_input_event", "eventName: string, value?: number, holdMs?: number", "Fire input event (FCC_LNAV, FCC_VNAV, etc.)"],
    ["type_text", "text: string, cdu?: 1|2, delayMs?: number", "Type text into CDU scratchpad"],
    ["press_cdu_key", "key: string, cdu?: 1|2", "Press CDU button (L1-L6, R1-R6, INIT, RTE, EXEC, etc.)"],
    ["send_keys", "keys: string", "Send keyboard combos to MSFS window (camera views)"],
    ["run_procedure", "filename?: string, delayMs?: number", "Run JSON command sequence or list available procedures"],
  ]),
  pageBreak(),
];

// ── SECTION: Communication Interfaces ────────────────────────────────────────
const commInterfaces = [
  h1("6. Communication Interfaces"),

  h2("6.1 MCP Protocol (stdio)"),
  para("The server uses the Model Context Protocol over stdio (stdin/stdout). The AI IDE spawns the server as a child process and communicates via JSON-RPC 2.0 messages."),
  simpleTable(["Aspect", "Detail"], [
    ["Transport", "stdio (stdin for requests, stdout for responses)"],
    ["Protocol", "JSON-RPC 2.0 (MCP specification)"],
    ["SDK", "@modelcontextprotocol/sdk ^1.29.0"],
    ["Serialization", "JSON with Zod schema validation"],
    ["Logging", "stderr only (never stdout, which would corrupt MCP protocol)"],
  ]),
  para(""),

  h2("6.2 SimConnect TCP Channel"),
  para("Binary TCP connection to the SimConnect server running inside MSFS Pro Edition."),
  simpleTable(["Aspect", "Detail"], [
    ["Host", "Configurable via SIMCONNECT_HOST env var (default: 127.0.0.1)"],
    ["Port", "Configurable via SIMCONNECT_PORT env var (default: 500)"],
    ["Protocol Version", "0x05 (KittyHawk)"],
    ["Header Format", "Send: 16 bytes (size, version, type|mask, msgID). Recv: 12 bytes (size, version, type)"],
    ["Operations", "Open, AddToDataDefinition, RequestData, MapClientEvent, TransmitClientEvent"],
    ["Reconnection", "Automatic 5-second retry on disconnect"],
  ]),
  para(""),

  h2("6.3 SimConnect FFI Channel"),
  para("Direct DLL function calls via koffi FFI to SimConnect.dll. This channel handles operations that are not available through the TCP binary protocol."),
  simpleTable(["Aspect", "Detail"], [
    ["Library", "koffi ^3.2.1 (native FFI for Node.js)"],
    ["DLL", "SimConnect.dll from MSFS Pro SDK"],
    ["Session", "Separate SimConnect_Open session from TCP client"],
    ["Thread Safety", "Single-threaded Node.js event loop; no concurrent FFI calls"],
    ["Functions Used", "Open, Close, GetNextDispatch, InspectHTML, EnumerateInputEvents, SetInputEvent"],
  ]),
  para(""),

  h2("6.4 InspectHTML Protocol"),
  para("The InspectHTML API sends gc:// URLs to instrument HTML panels and receives JSON responses. Used for CDU page reading, FMC data entry, and SimVar modification."),
  simpleTable(["URL Pattern", "Purpose", "Example"], [
    ["gc://AS05B_FMC_{n}?GETALL::...", "Read CDU page content", "gc://AS05B_FMC_1?GETALL::current_page="],
    ["gc://AS05B_FMC_{n}?INIT::...", "Send FMC command", "gc://AS05B_FMC_1?INIT::RTE 1&ORIGIN=KSEA"],
    ["gc://SETSIMVAR?{name}={value}&unit={unit}", "Set SimVar/LVar", "gc://SETSIMVAR?L:XMLVAR_FCC_FD_1_Value=1&unit=number"],
  ]),
  pageBreak(),
];

// ── SECTION: Data Flow Diagrams ──────────────────────────────────────────────
const dataFlows = [
  h1("7. Data Flow Diagrams"),

  h2("7.1 SimVar Polling Flow"),
  para("Continuous polling loop that reads aircraft state at configurable intervals."),
  new Paragraph({ children: [code("  AI Agent ─── get_position ──> MCP Server ──> State Cache ──> Response")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                    ^")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                    |  (polling loop)")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                              TCP Client ──> SimConnect ──> MSFS")], spacing: { after: 0 } }),
  para(""),
  para("1. On startup, index.js registers 200+ SimVar data definitions via TCP"),
  para("2. Every POLL_INTERVAL ms, requestData() is called for each definition"),
  para("3. SimConnect responds with SIMOBJECT_DATA messages containing values"),
  para("4. Values are stored in StateManager by category/name"),
  para("5. When AI agent calls get_position, the cached values are returned immediately"),
  para(""),

  h2("7.2 CDU Page Read Flow"),
  para("Reading the current FMC CDU page content via InspectHTML."),
  new Paragraph({ children: [code("  AI Agent ─── read_fmc_page ──> MCP Server")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                    |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                              drainHTMLQueue() ── flush stale messages")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                    |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                              inspectHTML(gc://AS05B_FMC_1?GETALL::...)")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                    |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                              poll dispatch() until HTML_DATA received")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                    |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                              parseCduPage(json) ── decode & structure")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                    |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                              Return structured page object")], spacing: { after: 0 } }),
  para(""),

  h2("7.3 Input Event Flow (fire_input_event)"),
  new Paragraph({ children: [code("  AI Agent ─── fire_input_event(FCC_LNAV) ──> MCP Server")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                                 |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                        getInputEventCache()")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                        (lazy: enumerate on first call)")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                                 |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                        Lookup hash from cache")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                                 |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                        SetInputEvent(hash, 1.0)")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                        sleep(holdMs)")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                        SetInputEvent(hash, 0.0)")], spacing: { after: 0 } }),
  para(""),

  h2("7.4 Procedure Execution Flow"),
  new Paragraph({ children: [code("  AI Agent ─── run_procedure(ksea_kgeg_preflight.json) ──> MCP Server")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                                              |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                                    Load JSON from disk")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                                              |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                                    For each command:")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                                      inspectHTML(url)")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                                      wait(delayMs)")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                                              |")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("                                                    Return step results")], spacing: { after: 0 } }),
  pageBreak(),
];

// ── SECTION: Dependencies ────────────────────────────────────────────────────
const dependencies = [
  h1("8. Dependencies and Prerequisites"),

  h2("8.1 Runtime Dependencies"),
  simpleTable(["Package", "Version", "Purpose"], [
    ["@modelcontextprotocol/sdk", "^1.29.0", "MCP protocol implementation (server, stdio transport, zod schemas)"],
    ["koffi", "^3.2.1", "Native FFI bridge for calling SimConnect.dll directly from Node.js"],
  ]),
  para(""),

  h2("8.2 System Prerequisites"),
  simpleTable(["Requirement", "Detail"], [
    ["Operating System", "Windows 10/11 x64 (required for SimConnect DLL and MSFS)"],
    ["Node.js", ">= 18.0.0 (LTS recommended)"],
    ["MSFS Professional Edition", "Version 0.8.4.9 or later, running locally"],
    ["MSFS Pro SDK", "SimConnect SDK installed (provides SimConnect.dll)"],
    ["SimConnect TCP", "SimConnect server listening on port 500 (default MSFS config)"],
  ]),
  para(""),

  h2("8.3 SimConnect DLL Discovery"),
  para("The FFI bridge locates SimConnect.dll using the following search order:"),
  bullet("1. MSFS_SDK_PATH environment variable (if set): %MSFS_SDK_PATH%\\SimConnect SDK\\lib\\SimConnect.dll"),
  bullet("2. Default SDK installation: C:\\MSFS Professional Edition SDK\\SimConnect SDK\\lib\\SimConnect.dll"),
  bullet("3. If not found, the server logs an error with the expected paths"),
  pageBreak(),
];

// ── SECTION: Configuration ───────────────────────────────────────────────────
const configuration = [
  h1("9. Configuration"),

  h2("9.1 Environment Variables"),
  simpleTable(["Variable", "Default", "Description"], [
    ["SIMCONNECT_HOST", "127.0.0.1", "SimConnect TCP server hostname"],
    ["SIMCONNECT_PORT", "500", "SimConnect TCP server port"],
    ["POLL_INTERVAL", "500", "SimVar polling interval in milliseconds"],
    ["MSFS_SDK_PATH", "(auto-detect)", "Override path to MSFS Pro SDK root directory"],
  ]),
  para(""),

  h2("9.2 Kiro MCP Configuration"),
  para("Add the following to .kiro/settings/mcp.json in your workspace:"),
  para(""),
  para("After npm publish to the Boeing SRES registry:"),
  new Paragraph({ children: [code('{')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('  "mcpServers": {')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('    "msfs-pro": {')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('      "command": "npx",')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('      "args": ["@boeing737-max8/msfs-pro-mcp@latest"],')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('      "env": {')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('        "SIMCONNECT_HOST": "127.0.0.1",')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('        "SIMCONNECT_PORT": "500",')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('        "POLL_INTERVAL": "500"')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('      }')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('    }')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('  }')], spacing: { after: 0 } }),
  new Paragraph({ children: [code('}')], spacing: { after: 0 } }),
  para(""),

  h2("9.3 npm Registry Configuration"),
  para("The package is published to the Boeing SRES Artifactory private registry. Team members need the following .npmrc configuration:"),
  new Paragraph({ children: [code("registry=https://artifactory-ext.digitalaviationservices.com/artifactory/api/npm/npm")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("strict-ssl=true")], spacing: { after: 0 } }),
  pageBreak(),
];

// ── SECTION: Directory Structure ─────────────────────────────────────────────
const dirStructure = [
  h1("10. Project Directory Structure"),
  para(""),
  new Paragraph({ children: [code("@boeing737-max8/msfs-pro-mcp/")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("├── src/")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   ├── index.js                  # Entry point: bootstrap MCP + SimConnect")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   ├── mcp/")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   ├── server.js             # MCP server factory, all tool handlers")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   ├── cdu_parser.js         # CDU HTML response parser")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   └── cdu_navigation.js     # CDU page routing and navigation")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   ├── simconnect/")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   ├── client.js             # TCP binary protocol client")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   └── ffi_bridge.js         # koffi FFI bridge to SimConnect.dll")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   ├── simvars/")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   └── registry.js           # 200+ SimVar definitions in 16 categories")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   ├── state/")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   └── manager.js            # In-memory state cache")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   ├── procedures/")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   ├── commands/             # JSON procedure files")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   │   └── ksea_kgeg_preflight.json")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   ├── run_commands.js       # Standalone procedure runner")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   ├── run_takeoff.js        # Takeoff automation script")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   │   └── takeoff_sequence.json # Takeoff procedure definition")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   └── helpers/")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│       └── InspectHTML.cs        # C# reference for InspectHTML API")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("├── test/")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   └── cdu_navigation.test.js    # Unit tests")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("├── docs/")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   └── MSFS_Pro_MCP_Server_TDD.docx  # This document")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("├── scripts/")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("│   └── generate_tdd.js           # TDD document generator")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("├── package.json")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("├── .npmrc                        # SRES registry configuration")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("├── .gitignore")], spacing: { after: 0 } }),
  new Paragraph({ children: [code("└── README.md")], spacing: { after: 0 } }),
  pageBreak(),
];

// ── SECTION: Setup & Installation ────────────────────────────────────────────
const installation = [
  h1("11. Setup and Installation Guide"),

  h2("11.1 Prerequisites Checklist"),
  bullet("Windows 10/11 x64 workstation"),
  bullet("Node.js >= 18 installed and on PATH"),
  bullet("MSFS Professional Edition installed and configured"),
  bullet("MSFS Pro SDK installed (SimConnect SDK with SimConnect.dll)"),
  bullet("Boeing network access for SRES Artifactory npm registry"),
  para(""),

  h2("11.2 Installation Steps"),
  para([bold("Step 1: "), run("Configure npm to use the Boeing SRES registry. Add to your global or project .npmrc:")]),
  new Paragraph({ children: [code("registry=https://artifactory-ext.digitalaviationservices.com/artifactory/api/npm/npm")], spacing: { after: 120 } }),
  para([bold("Step 2: "), run("Add MCP configuration to .kiro/settings/mcp.json (see Section 9.2)")]),
  para([bold("Step 3: "), run("Start MSFS Professional Edition and load the 737 MAX 8 aircraft")]),
  para([bold("Step 4: "), run("Restart the MCP server from the Kiro MCP panel")]),
  para([bold("Step 5: "), run("Verify connection using the get_connection_status tool")]),
  para(""),

  h2("11.3 Troubleshooting"),
  simpleTable(["Issue", "Cause", "Resolution"], [
    ["Connection closed", "MSFS not running or SimConnect port blocked", "Start MSFS, verify port 500 is accessible"],
    ["SimConnect_Open failed", "SDK not installed or DLL path wrong", "Install MSFS Pro SDK, set MSFS_SDK_PATH env var"],
    ["Stale data", "Polling not active", "Check POLL_INTERVAL, verify TCP connection"],
    ["CDU page read returns garbage", "Stale HTML_DATA in queue", "drainHTMLQueue automatically handles this; retry the read"],
    ["Input event not found", "Event cache not populated", "First call triggers enumeration; wait and retry"],
    ["Permission denied on npm install", "SRES registry auth required", "Run npm login against the Artifactory registry"],
  ]),
  pageBreak(),
];

// ── SECTION: Security ────────────────────────────────────────────────────────
const security = [
  h1("12. Security Considerations"),
  bullet("The package is published to a private Boeing registry (SRES Artifactory). Access requires Boeing network credentials."),
  bullet("SimConnect communication is local-only (127.0.0.1). No network-facing ports are opened."),
  bullet("The server runs as a child process of the AI IDE with the same permissions as the user."),
  bullet("No sensitive data (credentials, API keys) is stored in the package."),
  bullet("Win32 SendKeys functionality (send_keys tool) interacts with the MSFS window only."),
  bullet("All logging goes to stderr to prevent data leakage through the MCP stdio channel."),
];

// ── ASSEMBLE DOCUMENT ────────────────────────────────────────────────────────
const doc = new Document({
  creator: "TPS-BVAT Team",
  title: "MSFS Pro MCP Server — Technical Design Document",
  description: "Technical design document for @boeing737-max8/msfs-pro-mcp v2.0.0",
  styles: {
    default: {
      document: {
        run: { size: 22, font: "Calibri" },
        paragraph: { spacing: { line: 276 } },
      },
    },
  },
  sections: [{
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: "Boeing 737 MAX 8 — MSFS Pro MCP Server TDD", italics: true, size: 18, color: "888888" }),
          ],
          alignment: AlignmentType.RIGHT,
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: "Boeing Proprietary — @boeing737-max8/msfs-pro-mcp v2.0.0", size: 16, color: "888888" }),
          ],
          alignment: AlignmentType.CENTER,
        })],
      }),
    },
    children: [
      ...titlePage,
      ...docControl,
      ...execSummary,
      ...architecture,
      ...componentDesign,
      ...toolCatalog,
      ...commInterfaces,
      ...dataFlows,
      ...dependencies,
      ...configuration,
      ...dirStructure,
      ...installation,
      ...security,
    ],
  }],
});

// ── GENERATE ─────────────────────────────────────────────────────────────────
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUTPUT_PATH, buffer);
  console.log("[TDD Generator] Document written to: " + OUTPUT_PATH);
  console.log("[TDD Generator] Size: " + (buffer.length / 1024).toFixed(1) + " KB");
}).catch((err) => {
  console.error("[TDD Generator] Error:", err.message);
  process.exit(1);
});
