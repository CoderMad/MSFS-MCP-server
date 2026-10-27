const assert = require("node:assert/strict");
const test = require("node:test");

const {
  WatchRegistry,
  validateSimVarName,
  normalizeDataType,
  WATCH_DEF_ID_BASE,
  WATCH_REQUEST_ID_BASE,
} = require("../src/simvars/watch_registry");

test("validateSimVarName accepts well-formed names and rejects junk", () => {
  assert.equal(validateSimVarName("L:AIRLINER_V1_SPEED").ok, true);
  assert.equal(validateSimVarName("GENERAL ENG RPM:1").ok, true);
  assert.equal(validateSimVarName("PLANE ALTITUDE").ok, true);

  assert.equal(validateSimVarName("").ok, false);
  assert.equal(validateSimVarName("   ").ok, false);
  assert.equal(validateSimVarName("bad\nname").ok, false);
  assert.equal(validateSimVarName("inject$(rm)").ok, false);
});

test("validateSimVarName trims surrounding whitespace", () => {
  const res = validateSimVarName("  PLANE ALTITUDE  ");
  assert.equal(res.ok, true);
  assert.equal(res.name, "PLANE ALTITUDE");
});

test("normalizeDataType defaults and validates", () => {
  assert.equal(normalizeDataType(undefined), "float64");
  assert.equal(normalizeDataType("FLOAT64"), "float64");
  assert.equal(normalizeDataType("int32"), "int32");
  assert.equal(normalizeDataType("string"), null);
});

test("add registers a new watch with non-colliding IDs in the dynamic space", () => {
  const reg = new WatchRegistry();
  const r1 = reg.add({ name: "L:FOO", unit: "number" });
  assert.equal(r1.ok, true);
  assert.equal(r1.created, true);
  assert.equal(r1.watch.defID, WATCH_DEF_ID_BASE);
  assert.equal(r1.watch.requestID, WATCH_REQUEST_ID_BASE);
  assert.equal(r1.watch.registered, false);

  const r2 = reg.add({ name: "L:BAR", unit: "knots", dataType: "int32" });
  assert.equal(r2.watch.defID, WATCH_DEF_ID_BASE + 1);
  assert.equal(r2.watch.requestID, WATCH_REQUEST_ID_BASE + 1);
  assert.equal(r2.watch.dataType, "int32");
});

test("dynamic IDs never collide with the static registry request space", () => {
  const reg = new WatchRegistry();
  const r = reg.add({ name: "L:FOO" });
  // Static registry uses requestID 1000..~1270; dynamic must be far above.
  assert.ok(r.watch.requestID >= 100000);
  assert.ok(r.watch.defID >= 100000);
});

test("add is idempotent per name", () => {
  const reg = new WatchRegistry();
  const first = reg.add({ name: "L:FOO" });
  const second = reg.add({ name: "L:FOO" });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(reg.list().length, 1);
});

test("add rejects invalid names and types", () => {
  const reg = new WatchRegistry();
  assert.equal(reg.add({ name: "" }).ok, false);
  assert.equal(reg.add({ name: "bad\nname" }).ok, false);
  assert.equal(reg.add({ name: "L:FOO", dataType: "weird" }).ok, false);
});

test("remove and clear behave correctly", () => {
  const reg = new WatchRegistry();
  reg.add({ name: "L:FOO" });
  reg.add({ name: "L:BAR" });
  assert.equal(reg.remove("L:FOO"), true);
  assert.equal(reg.remove("L:FOO"), false);
  assert.equal(reg.list().length, 1);
  assert.equal(reg.clear(), 1);
  assert.equal(reg.list().length, 0);
});

test("byRequestID resolves back to the watch record", () => {
  const reg = new WatchRegistry();
  const r = reg.add({ name: "L:FOO" });
  const found = reg.byRequestID(r.watch.requestID);
  assert.equal(found.name, "L:FOO");
  assert.equal(reg.byRequestID(999999), null);
});

test("markRegistered and resetRegistration toggle registration flags", () => {
  const reg = new WatchRegistry();
  reg.add({ name: "L:FOO" });
  reg.markRegistered("L:FOO", true);
  assert.equal(reg.get("L:FOO").registered, true);
  reg.resetRegistration();
  assert.equal(reg.get("L:FOO").registered, false);
});

test("int32 watch maps to SimConnect data type 1, float64 to 4", () => {
  const reg = new WatchRegistry();
  const i = reg.add({ name: "L:INTVAR", dataType: "int32" });
  const f = reg.add({ name: "L:FLOATVAR", dataType: "float64" });
  assert.equal(reg.get("L:INTVAR").scDataType, 1);
  assert.equal(reg.get("L:FLOATVAR").scDataType, 4);
  // sanity on the public shape
  assert.equal(i.watch.dataType, "int32");
  assert.equal(f.watch.dataType, "float64");
});
