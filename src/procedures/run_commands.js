// Generic InspectHTML command runner — loads commands from a JSON file
// Usage: node run_commands.js <command_file.json>
const fs = require("fs");
const path = require("path");
const fb = require("../simconnect/ffi_bridge.js");

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    // List available command files
    const cmdDir = path.join(__dirname, "commands");
    if (fs.existsSync(cmdDir)) {
      const files = fs.readdirSync(cmdDir).filter(f => f.endsWith(".json"));
      console.log("Available command files:");
      for (const f of files) {
        const data = JSON.parse(fs.readFileSync(path.join(cmdDir, f), "utf8"));
        console.log("  " + f + " — " + (data.name || "unnamed") + " (" + (data.commands || []).length + " commands)");
      }
    }
    console.log("\nUsage: node run_commands.js <filename.json>");
    return;
  }

  // Resolve the file path
  let filePath = args[0];
  if (!path.isAbsolute(filePath)) {
    // Try in commands dir first
    const cmdPath = path.join(__dirname, "commands", filePath);
    if (fs.existsSync(cmdPath)) {
      filePath = cmdPath;
    } else if (!fs.existsSync(filePath)) {
      console.error("File not found: " + filePath);
      return;
    }
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const commands = data.commands || [];
  const delayMs = data.delayMs || 3000;

  console.log("=== " + (data.name || "Command Sequence") + " ===");
  console.log("Commands: " + commands.length + ", Delay: " + delayMs + "ms\n");

  fb.open();
  for (let i = 0; i < commands.length; i++) {
    const url = commands[i];
    const label = url.split("?")[1].split("&")[0];
    console.log("[" + (i + 1) + "/" + commands.length + "] " + label);
    try {
      const result = await fb.inspectHTML(url, 30000);
      console.log("  => " + result);
    } catch (err) {
      console.log("  => Error: " + err.message);
    }
    if (i < commands.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  console.log("\nDone.");
  fb.close();
}

run().catch(e => console.error("Fatal:", e));
