# @boeing737-max8/msfs-pro-mcp

**MSFS Professional Edition MCP Server** — Unified SimConnect gateway for the Boeing 737 MAX 8 flight model.

Enables AI-powered development tools (Kiro, VS Code, Copilot) to read aircraft state, control cockpit systems, interact with the FMC CDU, and execute automated procedures via the Model Context Protocol (MCP).

> **Classification:** Boeing Proprietary  
> **Registry:** SRES Artifactory (private)  
> **Platform:** Windows x64 only

---

## Prerequisites

| Requirement | Detail |
|---|---|
| **OS** | Windows 10/11 x64 |
| **Node.js** | >= 18.0.0 (LTS recommended) |
| **MSFS Professional Edition** | Installed and running locally |
| **MSFS Pro SDK** | SimConnect SDK installed (provides `SimConnect.dll`) |
| **Network** | Boeing network access for SRES Artifactory npm registry |
| **IDE** | Kiro or VS Code with MCP support |

---

## Installation

### Step 1: Configure npm Registry

Add the Boeing SRES Artifactory registry to your `.npmrc` (global or project-level):

```
registry=https://artifactory-ext.digitalaviationservices.com/artifactory/api/npm/npm
strict-ssl=true
```

If using a project-level `.npmrc`, place it in your workspace root.

### Step 2: Configure Kiro MCP

Add the following to `.kiro/settings/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "msfs-pro": {
      "command": "npx",
      "args": ["@boeing737-max8/msfs-pro-mcp@latest"],
      "env": {
        "SIMCONNECT_HOST": "127.0.0.1",
        "SIMCONNECT_PORT": "500",
        "POLL_INTERVAL": "500"
      },
      "disabled": false,
      "autoApprove": [
        "get_position", "get_flight_instruments", "get_autopilot",
        "get_engines", "get_fuel", "get_environment", "get_radio_nav",
        "get_fmc_state", "get_vnav", "get_ap_modes", "get_n1_thrust",
        "get_systems", "get_efis", "get_hud", "get_annunciations",
        "get_rnp_anp", "get_simvar", "get_all_state",
        "get_connection_status", "debug_log", "list_input_events",
        "watch_simvar", "unwatch_simvar", "list_watched_simvars",
        "read_fmc_page", "send_event", "run_inspecthtml",
        "fire_input_event", "type_text", "press_cdu_key",
        "send_keys", "run_procedure", "navigate_cdu_page"
      ]
    }
  }
}
```

### Step 3: Start MSFS and Connect

1. Launch **MSFS Professional Edition**
2. Load the **Boeing 737 MAX 8** aircraft
3. Ensure SimConnect is listening on port **500** (default)
4. Restart the MCP server from the Kiro MCP panel
5. Verify connection: ask the AI agent to call `get_connection_status`

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SIMCONNECT_HOST` | `127.0.0.1` | SimConnect TCP server hostname |
| `SIMCONNECT_PORT` | `500` | SimConnect TCP server port |
| `POLL_INTERVAL` | `500` | SimVar polling interval in milliseconds |
| `MSFS_SDK_PATH` | *(auto-detect)* | Override path to MSFS Pro SDK root directory |

---

## Available Tools (30+)

### Read Tools — Aircraft State
| Tool | Description |
|---|---|
| `get_position` | Latitude, longitude, altitude, heading, speed |
| `get_flight_instruments` | IAS, TAS, Mach, pitch, bank, control surfaces |
| `get_autopilot` | AP modes, GPS waypoint data |
| `get_engines` | N1/N2, EGT, oil, fuel flow (dual engine) |
| `get_fuel` | Fuel quantities and weight |
| `get_environment` | Temperature, pressure, wind |
| `get_radio_nav` | NAV/COM/ADF frequencies, VOR/DME, transponder |
| `get_fmc_state` | FMC state, V-speeds, route flags |
| `get_vnav` | VNAV speeds, constraints, descent state |
| `get_ap_modes` | FCC settings, HDG/ALT/VS/SPD selectors |
| `get_n1_thrust` | N1 limits, selected temperatures |
| `get_systems` | Hydraulics, pressurization, gear, APU |
| `get_efis` | Map mode, range, mins settings |
| `get_hud` | Speed bugs, AP selected values |
| `get_annunciations` | Master caution/warning, ATC messages |
| `get_rnp_anp` | Navigation accuracy (RNP/ANP) |
| `get_simvar` | Read any SimVar by exact name |
| `get_all_state` | All cached data across all categories |
| `get_connection_status` | Connection status and data freshness |
| `debug_log` | Recent SimConnect debug messages |
| `list_input_events` | Discover cockpit input events by filter |

### Read Tools — Dynamic SimVar Watches
Register **any** SimVar or L:Var at runtime so it is polled alongside the built-in registry. Watched values appear under the `watched` category and are readable via `get_simvar` / `get_all_state`.

| Tool | Description |
|---|---|
| `watch_simvar` | Start watching any SimVar/L:Var not in the built-in registry (idempotent) |
| `unwatch_simvar` | Stop watching a previously registered var |
| `list_watched_simvars` | List all dynamic watches and their registration status |

### Read Tools — FMC CDU
| Tool | Description |
|---|---|
| `read_fmc_page` | Read current CDU page — `mode="parsed"` (default, GETALL) or `mode="raw"` (GETALLRAW, undecoded) |
| `lookup_cdu_page` | Get page transition metadata |
| `verify_cdu_page` | Verify current page matches target |
| `navigate_cdu_page` | Navigate to a target FMC page |

### Write Tools — Cockpit Control
| Tool | Description |
|---|---|
| `send_event` | Send K-event (AP_MASTER, camera views) — validated (see Write Guardrails) |
| `set_simvar` | Set a SimVar/L:Var by name+value (SETSIMVAR wrapper) — validated |
| `run_inspecthtml` | Execute any gc:// InspectHTML URL — validated (see Write Guardrails) |
| `fire_input_event` | Fire input event (FCC_LNAV, FCC_VNAV, etc.) |
| `type_text` | Type text into CDU scratchpad |
| `press_cdu_key` | Press CDU button (L1-L6, R1-R6, INIT, etc.) |
| `send_keys` | Send keyboard combos to MSFS window |
| `run_procedure` | Execute JSON command sequence |

---

## Quick Examples

**Read aircraft position:**
```
Ask: "What's my current position?"
→ Agent calls get_position
```

**Set MCP altitude to FL300:**
```
Ask: "Set MCP altitude to 30000"
→ Agent calls fire_input_event("FCC_ALTITUDE_SEL", value=30000)
```

**Read FMC CDU page:**
```
Ask: "Read the current CDU page"
→ Agent calls read_fmc_page
```

**Enter ZFW on PERF INIT:**
```
Ask: "Set ZFW to 120"
→ Agent navigates to PERF INIT, types "120", presses L3
```

**Discover autopilot events:**
```
Ask: "List available FCC events"
→ Agent calls list_input_events(filter="FCC")
```

**Watch a custom L:Var not in the registry:**
```
Ask: "Keep an eye on L:MY_CUSTOM_LVAR"
→ Agent calls watch_simvar(name="L:MY_CUSTOM_LVAR")
→ then get_simvar("L:MY_CUSTOM_LVAR") returns the polled value
```

---

## Dynamic SimVar Watches

The built-in registry covers ~270 variables across 17 categories. When you need a
variable that is not in the registry — a custom L:Var, a rarely used SimVar, or an
indexed variant — register it at runtime with `watch_simvar`:

- The server assigns it a dedicated SimConnect data definition and begins polling it
  on the normal `POLL_INTERVAL` cadence.
- Values land under the `watched` category and are readable via `get_simvar` and
  `get_all_state`. The first value appears within one poll interval.
- Watches survive reconnects: after a SimConnect drop/reconnect they are
  automatically re-registered.
- `watch_simvar` is idempotent — re-watching an existing name is a no-op.

**Parameters for `watch_simvar`:**

| Param | Required | Default | Description |
|---|---|---|---|
| `name` | yes | — | Exact SimVar name, e.g. `L:AIRLINER_V1_SPEED`, `GENERAL ENG RPM:1` |
| `unit` | no | `number` | SimConnect unit string (`feet`, `knots`, `bool`, `degrees`, …) |
| `dataType` | no | `float64` | `float64` or `int32` (use `int32` for integer/enum/bool vars) |

---

## Write Guardrails

`send_event` and `run_inspecthtml` drive a live simulator, so their input is
validated **before** anything is sent. Blocked calls return `{ success: false,
blocked: true, code, error }` and never touch SimConnect. Validation rules follow
the MSFS Pro SDK.

**`run_inspecthtml` (gc:// URLs):**
- Must use the `gc://` scheme in the form `gc://instrument_id?args`.
- Must include an instrument id.
- Maximum length **2048 characters** (SDK `SimConnect_InspectHTML` limit).
- No embedded control characters.
- Unrecognized `gc://` verbs are allowed but surfaced as a `warnings[]` entry.

**`send_event` (K-events):**
- Event name must be a canonical SimConnect token (uppercase letters, digits,
  underscores), e.g. `AP_MASTER`, `THROTTLE_SET`, `VIEW_CAMERA_SELECT_2`.
- Names containing a **period** are rejected — the SDK states that no MSFS events
  contain periods (a period denotes a private/custom client event).
- Third-party reference forms `#nnnn` and `#0xnnnn` are accepted.
- The optional `data` parameter must be a 32-bit integer.
- Session-ending/destructive events (`SIM_RESET`, `QUIT`, `EXIT`, `ABORT`,
  `MENU_QUIT`, `KILL_SIM`) are blocked to protect the live sim.

---

## CDU Interaction Notes

- **type_text("DELETE")** — presses the DEL key (single press, puts "DELETE" in scratchpad)
- **type_text("CLR")** — presses the CLR key
- **Double CLR** — when an error message appears (e.g., "INVALID ENTRY"), first CLR clears the alert, second CLR clears the scratchpad value
- **Always verify scratchpad is empty** before typing new data to avoid input pollution

---

## Cockpit Event Reference

See `docs/cockpit_event_reference.json` for a complete mapping of all cockpit controls organized by panel:

- **MCP_AUTOPILOT** — N1, SPEED, VNAV, LNAV, HDG_SEL, ALT_HLD, VS, CMD, FD, bank angle, speed/heading/altitude knobs
- **EFIS** — Map mode, range, mins, baro, VOR/ADF selectors
- **OVERHEAD** — Lighting, electrical, engine, fuel, hydraulic, anti-ice, pressurization
- **PEDESTAL** — Throttles, flaps, speed brakes, parking brake, landing gear, autobrake, trim

Use `list_input_events(filter="FCC")` at runtime to discover available events dynamically.

---

## Troubleshooting

| Issue | Cause | Resolution |
|---|---|---|
| Connection closed | MSFS not running or port blocked | Start MSFS, verify port 500 is accessible |
| SimConnect_Open failed | SDK not installed or DLL path wrong | Install MSFS Pro SDK, set `MSFS_SDK_PATH` env var |
| Stale data | Polling not active | Check `POLL_INTERVAL`, verify TCP connection |
| CDU page read returns garbage | Stale HTML_DATA in queue | Retry the read (queue drain handles this automatically) |
| Input event not found | Event cache not populated | First call triggers enumeration; wait and retry |
| "INVALID ENTRY" stuck | Error message in scratchpad | Press CLR twice (once for alert, once for value) |

---

## Documentation

- **Technical Design Document:** `docs/MSFS_Pro_MCP_Server_TDD.docx`
- **Cockpit Event Reference:** `docs/cockpit_event_reference.json`
- **TDD Generator:** `scripts/generate_tdd.js` (regenerate with `node scripts/generate_tdd.js`)

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 2.3.0 | 2026-10-23 | `set_simvar` tool — set any SimVar/L:Var by name+value (validated SETSIMVAR wrapper); `read_fmc_page` `mode="raw"` (GETALLRAW, undecoded instrument response) |
| 2.2.0 | 2026-10-23 | Dynamic SimVar watches (watch_simvar / unwatch_simvar / list_watched_simvars) for any L:Var or SimVar at runtime; write-side guardrails on send_event and run_inspecthtml (SDK-grounded validation) |
| 2.0.0 | 2026-09-25 | Unified architecture: TCP + FFI bridge, InspectHTML, InputEvents, CDU tools, procedure runner, list_input_events discovery tool, DELETE/CLR keyword mapping in type_text |
| 1.0.0 | 2026-09-01 | Initial TCP-only MCP server with SimVar polling |
