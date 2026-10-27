// MCP Server v2.0 for MSFS Pro Edition — Unified SimConnect Gateway
// All capabilities (TCP K-events, FFI InspectHTML, FFI InputEvents, SETSIMVAR)
// exposed as MCP tools through a single server process.

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const path = require("path");
const fs = require("fs");
const ffiBridge = require("../simconnect/ffi_bridge");
const { getCategoryNames, getCategoryDescription, getVarsByCategory } = require("../simvars/registry");
const { validateInspectHtmlUrl, validateEventName, validateEventData, buildSetSimVarUrl } = require("./guardrails");
const { parseCduPage } = require("./cdu_parser");
const {
  CDU_PAGE_ROUTES,
  getCduPageLookup,
  resolveCduKeyEvent,
  navigateToCduPage,
  normalizeKeyName,
  verifyCduPage,
} = require("./cdu_navigation");

// ---------------------------------------------------------------------------
// Input event cache — populated lazily on first use, shared across all tools
// ---------------------------------------------------------------------------
let _inputEventCache = null;
let _inputEventCachePromise = null;

async function getInputEventCache() {
  if (_inputEventCache && _inputEventCache.size > 0) return _inputEventCache;
  if (_inputEventCachePromise) return _inputEventCachePromise;

  _inputEventCachePromise = ffiBridge.enumerateInputEvents(10000)
    .then((cache) => {
      _inputEventCache = cache;
      process.stderr.write("[msfs-pro-mcp] Cached " + cache.size + " input event names and aliases\n");
      return cache;
    })
    .finally(() => {
      _inputEventCachePromise = null;
    });

  return _inputEventCachePromise;
}

async function readCduPage(cduNum, timeoutMs = 3000) {
  const url = "gc://AS05B_FMC_" + cduNum + "?GETALL::current_page=";
  const jsonStr = await ffiBridge.inspectHTML(url, timeoutMs);
  let parsed;
  try { parsed = JSON.parse(jsonStr); } catch { parsed = { raw: jsonStr }; }
  return parseCduPage(parsed, cduNum);
}

// RAW mode: issue GETALLRAW and return the undecoded InspectHTML response as-is
// (no parseCduPage reconstruction). Useful for debugging the FMC instrument or
// inspecting markup/fields the parser strips. If the response is valid JSON it
// is included parsed; otherwise the raw string is returned verbatim.
async function readCduPageRaw(cduNum, timeoutMs = 3000) {
  const url = "gc://AS05B_FMC_" + cduNum + "?GETALLRAW::current_page";
  const rawStr = await ffiBridge.inspectHTML(url, timeoutMs);
  let parsed;
  let isJson = true;
  try { parsed = JSON.parse(rawStr); } catch { parsed = undefined; isJson = false; }
  return {
    cdu: cduNum,
    instrument: "AS05B_FMC_" + cduNum,
    mode: "raw",
    url,
    raw: rawStr,
    parsed: isJson ? parsed : undefined,
    isJson,
  };
}

async function pressMappedCduKey(key, cduNum, holdMs = 100) {
  const cache = await getInputEventCache();
  const resolved = resolveCduKeyEvent(cache, key, cduNum);
  if (!resolved) {
    const available = [];
    for (const [name] of cache) {
      if (name.toUpperCase().includes("FMC_EV_") && name.endsWith("_" + cduNum)) {
        available.push(name);
      }
    }
    throw new Error(
      `CDU key '${key}' was not found for CDU${cduNum}. ` +
      `Available FMC events: ${available.slice(0, 50).join(", ")}`
    );
  }

  await ffiBridge.pressInputEvent(resolved.eventName, cache, holdMs);
  return {
    key: resolved.key,
    eventName: resolved.eventName,
    descriptor: resolved.descriptor,
  };
}

function eventDescriptorSummary(descriptor) {
  if (!descriptor || typeof descriptor !== "object") return undefined;
  return {
    name: descriptor.name,
    type: descriptor.type,
    nodeNames: descriptor.nodeNames,
  };
}

// Present a watch to clients without leaking internal SimConnect IDs.
function sanitizeWatch(w) {
  if (!w || typeof w !== "object") return w;
  return {
    name: w.name,
    unit: w.unit,
    dataType: w.dataType,
    registered: !!w.registered,
    addedAt: typeof w.addedAt === "string" ? w.addedAt : new Date(w.addedAt).toISOString(),
  };
}

const CDU_PAGE_TARGETS = CDU_PAGE_ROUTES.map((route) => route.id).join(", ");

// ---------------------------------------------------------------------------
// Procedure runner — executes JSON procedure files server-side
// ---------------------------------------------------------------------------
const PROCEDURES_DIR = path.join(__dirname, "..", "procedures", "commands");

function listProcedures() {
  if (!fs.existsSync(PROCEDURES_DIR)) return [];
  return fs.readdirSync(PROCEDURES_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(PROCEDURES_DIR, f), "utf8"));
        return { file: f, name: data.name || f, commands: (data.commands || []).length, delayMs: data.delayMs || 3000 };
      } catch { return { file: f, name: f, commands: 0, delayMs: 0 }; }
    });
}

async function runProcedure(filename, delayOverride) {
  let filePath = path.join(PROCEDURES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    // Try absolute path
    if (fs.existsSync(filename)) filePath = filename;
    else throw new Error("Procedure file not found: " + filename);
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const commands = data.commands || [];
  const delayMs = delayOverride || data.delayMs || 3000;
  const results = [];

  for (let i = 0; i < commands.length; i++) {
    const url = commands[i];
    const label = url.split("?")[1] ? url.split("?")[1].split("&")[0] : url;
    try {
      const result = await ffiBridge.inspectHTML(url, 30000);
      results.push({ step: i + 1, label, success: true, result });
    } catch (err) {
      results.push({ step: i + 1, label, success: false, error: err.message });
    }
    if (i < commands.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return { name: data.name, file: filename, totalSteps: commands.length, delayMs, results };
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------
function createMcpServer(stateManager) {
  const server = new McpServer({
    name: "msfs-pro-mcp",
    version: "2.3.0",
    description: "MSFS Pro Edition 737 MAX 8 — unified SimConnect gateway",
  });

  // =========================================================================
  // READ TOOLS — SimVar categories
  // =========================================================================
  for (const category of getCategoryNames()) {
    const toolName = `get_${category}`;
    const desc = getCategoryDescription(category);
    const vars = getVarsByCategory(category);
    const varNames = vars.map(v => v.name).join(", ");

    server.tool(toolName, `Returns ${desc}. Variables: ${varNames}`, {}, async () => {
      const data = stateManager.getCategory(category);
      if (Object.keys(data).length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ available: false, error: `No data for '${category}'.`, recoverable: true }) }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify({ category, timestamp: new Date().toISOString(), data }) }] };
    });
  }

  // =========================================================================
  // READ TOOLS — generic simvar, all state, connection, debug
  // =========================================================================
  server.tool("get_simvar",
    "Read a specific SimVar value by its exact name (e.g., 'L:AIRLINER_V1_SPEED', 'PLANE ALTITUDE'). Searches both the static registry and any dynamically watched vars (see watch_simvar). If the var is not found, register it with watch_simvar first.",
    { name: z.string().describe("The exact SimVar name") },
    async ({ name }) => {
      // Search the static categories first, then the dynamic 'watched' category.
      const searchCats = [...getCategoryNames()];
      if (stateManager._watchRegistry) searchCats.push(stateManager._watchRegistry.category);
      for (const cat of searchCats) {
        const data = stateManager.getCategory(cat);
        if (name in data) {
          return { content: [{ type: "text", text: JSON.stringify({ name, value: data[name], category: cat, timestamp: new Date().toISOString() }) }] };
        }
      }
      // Give a helpful hint if the name is a registered watch but has no value yet.
      const isPendingWatch = stateManager._watchRegistry && stateManager._watchRegistry.has(name);
      return { content: [{ type: "text", text: JSON.stringify({
        available: false,
        error: `SimVar '${name}' not found.`,
        hint: isPendingWatch
          ? "This var is watched but has not received a value yet. Retry shortly or check get_connection_status."
          : "Not in the static registry. Call watch_simvar to start polling it.",
      }) }], isError: true };
    }
  );

  server.tool("get_all_state", "Returns ALL cached SimVar data across all categories in a single response", {}, async () => {
    return { content: [{ type: "text", text: JSON.stringify({ timestamp: new Date().toISOString(), stale: stateManager.isStale(), categories: stateManager.getAll() }) }] };
  });

  server.tool("get_connection_status", "Returns SimConnect connection status and data freshness", {}, async () => {
    const lu = stateManager.lastUpdated();
    return { content: [{ type: "text", text: JSON.stringify({ connected: lu > 0, lastUpdated: lu > 0 ? new Date(lu).toISOString() : null, stale: stateManager.isStale(), ageMs: lu > 0 ? Date.now() - lu : null }) }] };
  });

  server.tool("debug_log", "Shows recent SimConnect debug messages including unknown recv types and exceptions. For troubleshooting.", {}, async () => {
    return { content: [{ type: "text", text: JSON.stringify(stateManager._debugLog || [], null, 2) }] };
  });

  // =========================================================================
  // READ TOOLS — Input event discovery
  // =========================================================================
  server.tool("list_input_events",
    "Lists available SimConnect input events from the aircraft, with optional filtering by name pattern. Use to discover cockpit control event names for fire_input_event. Examples: filter='FCC' for MCP/autopilot, 'LIGHTING' for lights, 'FUEL' for fuel panel, 'EFIS' for EFIS controls, 'FMC_EV' for CDU keys.",
    {
      filter: z.string().optional().describe("Case-insensitive substring to filter event names (e.g. 'FCC', 'LIGHTING', 'FUEL', 'EFIS', 'FMC_EV')"),
      limit: z.number().optional().describe("Max results to return (default 50)"),
    },
    async ({ filter, limit }) => {
      try {
        const cache = await getInputEventCache();
        const maxResults = limit || 50;
        const results = [];
        const seen = new Set();
        const filterUpper = filter ? filter.toUpperCase() : null;

        for (const [name, descriptor] of cache) {
          if (seen.has(name)) continue;
          if (filterUpper && !name.toUpperCase().includes(filterUpper)) continue;
          seen.add(name);
          results.push({
            name,
            type: descriptor.type,
            nodeNames: descriptor.nodeNames.length > 0 ? descriptor.nodeNames : undefined,
          });
          if (results.length >= maxResults) break;
        }

        return { content: [{ type: "text", text: JSON.stringify({
          success: true,
          filter: filter || null,
          totalCached: cache.size,
          returned: results.length,
          events: results,
          timestamp: new Date().toISOString(),
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
      }
    }
  );

  // =========================================================================
  // WATCH TOOLS — dynamically poll any SimVar / L:Var at runtime
  // =========================================================================
  server.tool("watch_simvar",
    "Starts watching an arbitrary SimVar or L:Var that is not in the built-in registry, so it gets polled continuously and is readable via get_simvar / get_all_state (under the 'watched' category). Use for any variable the client cares about, e.g. 'L:MY_CUSTOM_LVAR', 'GENERAL ENG RPM:1', 'SPOILERS HANDLE POSITION'. Idempotent: re-watching an existing name is a no-op. The first value appears within one poll interval.",
    {
      name: z.string().describe("Exact SimVar name, e.g. 'L:AIRLINER_V1_SPEED', 'PLANE ALTITUDE', 'GENERAL ENG RPM:1'"),
      unit: z.string().optional().describe("SimConnect unit string (e.g. 'feet', 'knots', 'number', 'bool', 'degrees'). Default 'number'."),
      dataType: z.enum(["float64", "int32"]).optional().describe("Value type. Default 'float64'. Use 'int32' for integer/enum/bool vars."),
    },
    async ({ name, unit, dataType }) => {
      const reg = stateManager._watchRegistry;
      if (!reg) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Watch registry unavailable." }) }], isError: true };
      }
      const result = reg.add({ name, unit, dataType });
      if (!result.ok) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error, name }) }], isError: true };
      }

      // Register on the live connection immediately so polling can begin this tick.
      let registration = "pending";
      let note;
      if (result.created && typeof stateManager._registerWatch === "function") {
        try {
          await stateManager._registerWatch(reg.get(name));
          registration = "active";
        } catch (err) {
          note = "Registered in server; will attach to SimConnect on next connect. (" + err.message + ")";
        }
      } else if (!result.created) {
        registration = result.watch.registered ? "active" : "pending";
      }

      return { content: [{ type: "text", text: JSON.stringify({
        success: true,
        created: result.created,
        alreadyWatched: !result.created,
        registration,
        note,
        watch: reg.get(name) ? sanitizeWatch(reg.get(name)) : result.watch,
        timestamp: new Date().toISOString(),
      }, null, 2) }] };
    }
  );

  server.tool("unwatch_simvar",
    "Stops watching a dynamically registered SimVar/L:Var previously added with watch_simvar. Does not affect the built-in registry. Returns whether the name was being watched.",
    { name: z.string().describe("Exact SimVar name to stop watching") },
    async ({ name }) => {
      const reg = stateManager._watchRegistry;
      if (!reg) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Watch registry unavailable." }) }], isError: true };
      }
      const removed = reg.remove(name);
      return { content: [{ type: "text", text: JSON.stringify({
        success: true,
        removed,
        name,
        remaining: reg.list().length,
        note: removed ? undefined : "Name was not being watched.",
        timestamp: new Date().toISOString(),
      }, null, 2) }] };
    }
  );

  server.tool("list_watched_simvars",
    "Lists all dynamically watched SimVars/L:Vars registered via watch_simvar, including their unit, data type, and whether they are actively registered on the live SimConnect connection.",
    {},
    async () => {
      const reg = stateManager._watchRegistry;
      if (!reg) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Watch registry unavailable." }) }], isError: true };
      }
      const watches = reg.list().map(sanitizeWatch);
      return { content: [{ type: "text", text: JSON.stringify({
        success: true,
        count: watches.length,
        watches,
        timestamp: new Date().toISOString(),
      }, null, 2) }] };
    }
  );

  // =========================================================================
  // WRITE TOOLS — set_simvar (SETSIMVAR wrapper)
  // =========================================================================
  server.tool("set_simvar",
    "Sets a SimVar or L:Var by name to a value via SimConnect InspectHTML SETSIMVAR (fire-and-forget). A convenience wrapper so callers don't hand-build gc:// URLs. Examples: set_simvar('L:XMLVAR_FCC_FD_1_Value', 1), set_simvar('ELEVATOR POSITION', 0.08, 'Position'). The value is URL-encoded and the name/unit validated before sending. To confirm the write took effect, read it back with get_simvar (watch_simvar first if it is not in the static registry).",
    {
      name: z.string().describe("Exact SimVar/L:Var name, e.g. 'L:XMLVAR_NON_NORMAL_DRIVE_FAILURE_1', 'ELEVATOR POSITION'"),
      value: z.union([z.number(), z.string()]).describe("Value to set. Numbers for most vars; strings allowed for string-typed vars."),
      unit: z.string().optional().describe("SimConnect unit string. Default 'number'. Common: 'number', 'Position', 'feet', 'knots', 'bool'."),
    },
    async ({ name, value, unit }) => {
      // --- Guardrail: validate name/value/unit and build a safe URL ---
      const built = buildSetSimVarUrl(name, value, unit);
      if (!built.ok) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, blocked: true, code: built.code, error: built.reason, name }) }], isError: true };
      }
      try {
        // SETSIMVAR produces no HTML_DATA response — fire-and-forget.
        let result;
        if (ffiBridge.inspectHTMLFireAndForget) {
          result = await ffiBridge.inspectHTMLFireAndForget(built.url);
        } else {
          try { result = await ffiBridge.inspectHTML(built.url, 500); } catch { result = "OK"; }
        }
        return { content: [{ type: "text", text: JSON.stringify({
          success: true,
          name: built.name,
          value: built.value,
          unit: built.unit,
          url: built.url,
          result,
          note: "Fire-and-forget. Read back with get_simvar to confirm (watch_simvar first if not in the registry).",
          timestamp: new Date().toISOString(),
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message, name: built.name, url: built.url }) }], isError: true };
      }
    }
  );

  // =========================================================================
  // READ TOOLS — FMC CDU page
  // =========================================================================
  server.tool("read_fmc_page",
    "Reads the current FMC CDU page from CDU1 or CDU2 via SimConnect InspectHTML. Two modes: 'parsed' (default) sends GETALL and returns the structured page (title, labels, lines, scratchpad, reconstructed display); 'raw' sends GETALLRAW and returns the undecoded response as-is (no parsing) for debugging the FMC instrument or inspecting raw markup/fields.",
    {
      cdu: z.number().int().min(1).max(2).optional().describe("CDU number: 1 for Captain (default), 2 for First Officer"),
      mode: z.enum(["parsed", "raw"]).optional().describe("'parsed' (default): structured page via GETALL. 'raw': undecoded response via GETALLRAW."),
    },
    async ({ cdu, mode }) => {
      const cduNum = cdu || 1;
      const readMode = mode || "parsed";
      try {
        const result = readMode === "raw"
          ? await readCduPageRaw(cduNum)
          : await readCduPage(cduNum);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message, cdu: cduNum, mode: readMode }) }], isError: true };
      }
    }
  );

  server.tool("lookup_cdu_page",
    `Looks up the CDU page transition and verification metadata used by the navigation tools. Supported targets: ${CDU_PAGE_TARGETS}.`,
    {
      targetPage: z.string().describe("Logical target page, for example 'PERF INIT', 'POS INIT', 'RTE', 'DEP/ARR', or 'LEGS'"),
    },
    async ({ targetPage }) => {
      try {
        return {
          content: [{ type: "text", text: JSON.stringify(getCduPageLookup(targetPage), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message, targetPage }) }],
          isError: true,
        };
      }
    }
  );

  server.tool("verify_cdu_page",
    `Verifies the current CDU page against the shared page lookup metadata. Supported targets: ${CDU_PAGE_TARGETS}.`,
    {
      targetPage: z.string().describe("Logical target page to verify"),
      cdu: z.number().int().min(1).max(2).optional().describe("CDU number: 1 for Captain (default), 2 for First Officer"),
    },
    async ({ targetPage, cdu }) => {
      const cduNum = cdu || 1;
      try {
        const result = await verifyCduPage({
          targetPage,
          cdu: cduNum,
          readPage: (requestedCdu) => readCduPage(requestedCdu, 3000),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message, targetPage, cdu: cduNum }) }],
          isError: true,
        };
      }
    }
  );

  server.tool("navigate_cdu_page",
    `Navigates CDU1 or CDU2 to a requested FMC page using the shared CDU page lookup and the aircraft's enumerated InputEvents, then verifies the resulting page through InspectHTML. Call this before page-specific CDU actions. Supported targets: ${CDU_PAGE_TARGETS}.`,
    {
      targetPage: z.string().describe("Logical target page, for example 'PERF INIT', 'POS INIT', 'RTE', 'DEP/ARR', or 'LEGS'"),
      cdu: z.number().int().min(1).max(2).optional().describe("CDU number: 1 for Captain (default), 2 for First Officer"),
      maxSteps: z.number().int().min(1).max(30).optional().describe("Maximum physical CDU key presses, default 8"),
      stepDelayMs: z.number().int().min(0).max(5000).optional().describe("Delay before verifying each key press, default 350ms"),
    },
    async ({ targetPage, cdu, maxSteps, stepDelayMs }) => {
      const cduNum = cdu || 1;
      try {
        const result = await navigateToCduPage({
          targetPage,
          cdu: cduNum,
          maxSteps: maxSteps || 8,
          stepDelayMs: stepDelayMs === undefined ? 350 : stepDelayMs,
          readPage: (requestedCdu) => readCduPage(requestedCdu, 3000),
          pressKey: (key, requestedCdu) => pressMappedCduKey(key, requestedCdu, 100),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.success === false,
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message, targetPage, cdu: cduNum }) }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // WRITE TOOLS — K-events via TCP SimConnect
  // =========================================================================
  server.tool("send_event",
    "Sends a named SimConnect event to the simulator (e.g. VIEW_CAMERA_SELECT_2, AP_MASTER). Use for camera changes, autopilot, and sim control.",
    {
      eventName: z.string().describe("The SimConnect event name, e.g. VIEW_CAMERA_SELECT_2, AP_MASTER"),
      data: z.number().optional().describe("Optional data parameter for the event (default 0)"),
    },
    async ({ eventName, data }) => {
      // --- Guardrails: validate before touching the live sim ---
      const nameCheck = validateEventName(eventName);
      if (!nameCheck.ok) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, blocked: true, code: nameCheck.code, error: nameCheck.reason, eventName }) }], isError: true };
      }
      const dataCheck = validateEventData(data);
      if (!dataCheck.ok) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, blocked: true, code: dataCheck.code, error: dataCheck.reason, eventName }) }], isError: true };
      }
      const safeEventName = nameCheck.eventName;
      const safeData = dataCheck.data;

      if (!stateManager._simClient || !stateManager._simClient.connected) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "SimConnect not connected." }) }], isError: true };
      }
      try {
        const eventID = stateManager._nextEventID++;
        await stateManager._simClient.mapClientEventToSimEvent(eventID, safeEventName);
        await stateManager._simClient.transmitClientEvent(0, eventID, safeData, 1, 0x10);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, eventName: safeEventName, eventID, data: safeData, warnings: nameCheck.warnings, timestamp: new Date().toISOString() }) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message, eventName: safeEventName }) }], isError: true };
      }
    }
  );

  // =========================================================================
  // WRITE TOOLS — InspectHTML (any gc:// URL)
  // =========================================================================
  server.tool("run_inspecthtml",
    "Executes an arbitrary InspectHTML command URL against the simulator. Use for SETSIMVAR (set LVars/SimVars), FMC INIT commands, or any gc:// URL. For page-specific FMC work, call navigate_cdu_page first so the physical CDU page is transitioned and verified. Examples: 'gc://SETSIMVAR?L:XMLVAR_FCC_FD_1_Value=1&unit=number', 'gc://AS05B_FMC_1?INIT::RTE 1&ORIGIN=KSEA&DEST=KGEG'",
    {
      url: z.string().describe("The full gc:// InspectHTML URL to execute"),
      timeoutMs: z.number().optional().describe("Timeout in ms, defaults to 5000"),
    },
    async ({ url, timeoutMs }) => {
      // --- Guardrails: validate the gc:// URL before sending it to the sim ---
      const urlCheck = validateInspectHtmlUrl(url);
      if (!urlCheck.ok) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, blocked: true, code: urlCheck.code, error: urlCheck.reason, url }) }], isError: true };
      }
      try {
        // SETSIMVAR is fire-and-forget (no HTML_DATA response)
        const isSETSIMVAR = url.toUpperCase().includes("SETSIMVAR");
        let result;
        if (isSETSIMVAR) {
          if (ffiBridge.inspectHTMLFireAndForget) {
            result = await ffiBridge.inspectHTMLFireAndForget(url);
          } else {
            try { result = await ffiBridge.inspectHTML(url, 500); } catch { result = "OK"; }
          }
        } else {
          result = await ffiBridge.inspectHTML(url, timeoutMs || 5000);
        }
        let parsed;
        try { parsed = JSON.parse(result); } catch { parsed = { raw: result }; }
        const warnings = urlCheck.warnings && urlCheck.warnings.length ? urlCheck.warnings : undefined;
        return { content: [{ type: "text", text: JSON.stringify({ success: true, url, result: parsed, warnings, timestamp: new Date().toISOString() }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message, url }) }], isError: true };
      }
    }
  );

  // =========================================================================
  // WRITE TOOLS — Fire any input event by name (FCC_LNAV, FCC_VNAV, etc.)
  // =========================================================================
  server.tool("fire_input_event",
    "Fires a SimConnect input event by its exact name. Works for any input event: FCC_LNAV, FCC_VNAV, FCC_FD_1, FCC_FD_2, FMC_EV_EXEC_1, etc. Use this for MCP panel buttons (LNAV, VNAV, HDG SEL, etc.) that are not K-events.",
    {
      eventName: z.string().describe("The exact input event name, e.g. FCC_LNAV, FCC_VNAV, FCC_FD_1"),
      value: z.number().optional().describe("Event value (default 1.0 press then 0.0 release)"),
      holdMs: z.number().optional().describe("Hold duration in ms before release (default 100)"),
    },
    async ({ eventName, value, holdMs }) => {
      try {
        const cache = await getInputEventCache();
        const descriptor = cache.get(eventName);
        if (!descriptor) {
          // Find similar events for debugging
          const similar = [];
          const upper = eventName.toUpperCase();
          for (const [name] of cache) {
            if (name.toUpperCase().includes(upper) || upper.includes(name.toUpperCase())) {
              similar.push(name);
              if (similar.length >= 20) break;
            }
          }
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Input event '" + eventName + "' not found in " + cache.size + " cached events.", similar }, null, 2) }], isError: true };
        }
        if (value !== undefined && value !== null) {
          // Single set (no release)
          ffiBridge.setInputEvent(descriptor, value);
        } else {
          // Press and release
          await ffiBridge.pressInputEvent(eventName, cache, holdMs || 100);
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: true, eventName, descriptor: eventDescriptorSummary(descriptor), timestamp: new Date().toISOString() }) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message, eventName }) }], isError: true };
      }
    }
  );

  // =========================================================================
  // WRITE TOOLS — CDU keyboard: type_text
  // =========================================================================
  server.tool("type_text",
    "Types text into the CDU scratchpad by simulating CDU keyboard button presses via SimConnect input events. Supports A-Z, 0-9, and special keys: CLR, DEL, SP (space), DIV (/), DOT (.), PLUSMINUS (+/-). Default target is CDU1.",
    {
      text: z.string().describe("Text to type into the scratchpad (e.g. 'KSEA', '120'). Use uppercase letters A-Z, digits 0-9. Special keywords: 'DELETE' presses the DEL key (puts DELETE in scratchpad), 'CLR' presses CLR key."),
      cdu: z.number().optional().describe("CDU number: 1 for Captain (default), 2 for First Officer"),
      delayMs: z.number().optional().describe("Delay between key presses in ms (default 150)"),
    },
    async ({ text, cdu, delayMs }) => {
      const cduNum = cdu || 1;
      const delay = delayMs || 150;
      try {
        const cache = await getInputEventCache();
        const results = [];

        // Map special keywords to single CDU key presses
        const KEYWORD_TO_KEY = {
          "DELETE": "DEL",
          "CLR": "CLR",
          "CLEAR": "CLR",
        };
        const upperText = text.toUpperCase().trim();
        if (KEYWORD_TO_KEY[upperText]) {
          const specialKey = KEYWORD_TO_KEY[upperText];
          const resolved = resolveCduKeyEvent(cache, specialKey, cduNum);
          if (!resolved) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "CDU key '" + specialKey + "' not found for keyword '" + upperText + "'", text, cdu: cduNum }) }], isError: true };
          }
          await ffiBridge.pressInputEvent(resolved.eventName, cache, 80);
          results.push({ char: upperText, key: resolved.key, eventName: resolved.eventName, status: "ok" });
          return { content: [{ type: "text", text: JSON.stringify({ success: true, text, cdu: cduNum, keysPressed: 1, keyword: upperText, mappedKey: specialKey, details: results, timestamp: new Date().toISOString() }, null, 2) }] };
        }

        for (let i = 0; i < text.length; i++) {
          const ch = text[i].toUpperCase();
          let logicalKey;
          if (ch === " ") logicalKey = "SP";
          else if (ch === "/") logicalKey = "DIV";
          else if (ch === ".") logicalKey = "DOT";
          else if (ch === "-" || ch === "+") logicalKey = "PLUSMINUS";
          else if (/^[A-Z0-9]$/.test(ch)) logicalKey = ch;
          else { results.push({ char: ch, status: "skipped" }); continue; }

          const resolved = resolveCduKeyEvent(cache, logicalKey, cduNum);
          if (!resolved) {
            results.push({ char: ch, key: normalizeKeyName(logicalKey), status: "not_found" });
            continue;
          }
          await ffiBridge.pressInputEvent(resolved.eventName, cache, 80);
          results.push({ char: ch, key: resolved.key, eventName: resolved.eventName, status: "ok" });
          if (i < text.length - 1) await new Promise(r => setTimeout(r, delay));
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: true, text, cdu: cduNum, keysPressed: results.filter(r => r.status === "ok").length, details: results, timestamp: new Date().toISOString() }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message, text, cdu: cduNum }) }], isError: true };
      }
    }
  );

  // =========================================================================
  // WRITE TOOLS — CDU button press (LSK, function keys)
  // =========================================================================
  server.tool("press_cdu_key",
    "Presses a specific CDU button via SimConnect input events. Supports line select keys (L1-L6, R1-R6), function keys (INIT, RTE, DEPARR, LEGS, HOLD, PROG, EXEC, MENU, NAVRAD, PREVPAGE, NEXTPAGE, FIX, FMCCOMM, ATC), and edit keys (CLR, DEL, SP, DIV, DOT, PLUSMINUS). Default target is CDU1.",
    {
      key: z.string().describe("CDU key name: L1-L6, R1-R6, INIT, RTE, DEPARR, LEGS, HOLD, PROG, EXEC, MENU, NAVRAD, CLR, DEL, PREVPAGE, NEXTPAGE, etc."),
      cdu: z.number().optional().describe("CDU number: 1 for Captain (default), 2 for First Officer"),
    },
    async ({ key, cdu }) => {
      const cduNum = cdu || 1;
      const keyUpper = normalizeKeyName(key);
      try {
        const cache = await getInputEventCache();
        const resolved = resolveCduKeyEvent(cache, keyUpper, cduNum);
        if (!resolved) {
          const similar = [];
          for (const [name] of cache) {
            if (name.includes("FMC_EV_") && name.endsWith("_" + cduNum)) similar.push(name);
          }
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "CDU key '" + keyUpper + "' not found", availableFmcEvents: similar.slice(0, 50) }, null, 2) }], isError: true };
        }
        await ffiBridge.pressInputEvent(resolved.eventName, cache, 100);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, key: keyUpper, eventName: resolved.eventName, type: resolved.descriptor.type, cdu: cduNum, timestamp: new Date().toISOString() }) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message, key: keyUpper, cdu: cduNum }) }], isError: true };
      }
    }
  );

  // =========================================================================
  // WRITE TOOLS — Win32 keyboard input
  // =========================================================================
  server.tool("send_keys",
    "Sends keyboard key combinations to the MSFS Pro Edition window. Uses PowerShell to focus the sim window and send keys. Format: ^ for Ctrl, % for Alt, + for Shift. Examples: '^2' for Ctrl+2, '{F1}' for F1. CAMERA VIEWS: ^1=PFD+MFD, ^2=FMC/CDU, ^3=PFD+MFD+FMC, ^4=MCP panel, ^5=Pedestal, ^6=Rear pedestal (radio tuning), ^7=Overhead panel, ^8=Extended overhead. Use ^2 for FMC work, ^1 for PFD/ND, ^4 for autopilot MCP, ^6 for radio tuning, ^7 for overhead systems.",
    { keys: z.string().describe("SendKeys format string, e.g. '^2' for Ctrl+2, '%{F4}' for Alt+F4, '{F1}' for F1") },
    async ({ keys }) => {
      const { execSync } = require("child_process");
      const os = require("os");
      try {
        const scriptPath = path.join(os.tmpdir(), "msfs_sendkeys.ps1");
        let lines = [];
        lines.push('Add-Type -TypeDefinition @"');
        lines.push("using System;");
        lines.push("using System.Runtime.InteropServices;");
        lines.push("public class KS {");
        lines.push('  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);');
        lines.push('  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);');
        lines.push("}");
        lines.push('"@');
        lines.push("$p = Get-Process -Name FlightSimulator -EA SilentlyContinue");
        lines.push('if(!$p){Write-Output "MSFS_NOT_FOUND";exit}');
        lines.push("[KS]::SetForegroundWindow($p.MainWindowHandle)|Out-Null");
        lines.push("Start-Sleep -Milliseconds 300");
        let mods = [];
        for (let i = 0; i < keys.length; i++) {
          const ch = keys[i];
          if (ch === "^") { mods.push(0x11); continue; }
          if (ch === "%") { mods.push(0x12); continue; }
          if (ch === "+") { mods.push(0x10); continue; }
          for (const m of mods) lines.push("[KS]::keybd_event(" + m + ",0,0,[UIntPtr]::Zero)");
          let vk;
          if (ch === "{") {
            const end = keys.indexOf("}", i);
            const name = keys.substring(i + 1, end).toUpperCase();
            const fm = name.match(/^F(\d+)$/);
            if (fm) vk = 0x6F + parseInt(fm[1]);
            else vk = name.charCodeAt(0);
            i = end;
          } else {
            vk = ch.toUpperCase().charCodeAt(0);
          }
          lines.push("[KS]::keybd_event(" + vk + ",0,0,[UIntPtr]::Zero)");
          lines.push("Start-Sleep -Milliseconds 50");
          lines.push("[KS]::keybd_event(" + vk + ",0,2,[UIntPtr]::Zero)");
          for (const m of [...mods].reverse()) lines.push("[KS]::keybd_event(" + m + ",0,2,[UIntPtr]::Zero)");
          mods = [];
        }
        lines.push('Write-Output "OK"');
        fs.writeFileSync(scriptPath, lines.join("\r\n"), "utf8");
        const result = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + scriptPath + '"', { timeout: 8000 }).toString().trim();
        if (result === "MSFS_NOT_FOUND") {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "FlightSimulator process not found." }) }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: true, keys, timestamp: new Date().toISOString() }) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
      }
    }
  );

  // =========================================================================
  // CONTROL TOOLS — run_procedure (JSON command sequences)
  // =========================================================================
  server.tool("run_procedure",
    "Runs a saved InspectHTML command sequence from a JSON file. Use for preflight FMC programming, departure setup, etc. Call with no arguments to list available procedures.",
    {
      filename: z.string().optional().describe("JSON filename in procedures/commands/ (e.g. 'ksea_kgeg_preflight.json'). Omit to list available files."),
      delayMs: z.number().optional().describe("Override delay between commands in ms (default from file)"),
    },
    async ({ filename, delayMs }) => {
      if (!filename) {
        const procs = listProcedures();
        return { content: [{ type: "text", text: JSON.stringify({ available: procs, timestamp: new Date().toISOString() }, null, 2) }] };
      }
      try {
        const result = await runProcedure(filename, delayMs);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message, filename }) }], isError: true };
      }
    }
  );

  return server;
}

module.exports = { createMcpServer };
