const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getCduPageLookup,
  navigateToCduPage,
  pageMatchesRoute,
  resolvePageRoute,
  verifyCduPage,
} = require("../src/mcp/cdu_navigation");

function makePage(title, rows = []) {
  const paddedRows = Array.from({ length: 6 }, (_, index) => rows[index] || {});
  return {
    title,
    pageCurrent: "",
    pageCount: "",
    rows: paddedRows.map((row) => ({
      label: {
        left: row.label?.left || "",
        center: row.label?.center || "",
        right: row.label?.right || "",
      },
      line: {
        left: row.line?.left || "",
        center: row.line?.center || "",
        right: row.line?.right || "",
      },
    })),
  };
}

test("page lookup exposes transition recovery and verification metadata", () => {
  const lookup = getCduPageLookup("POS INIT");

  assert.equal(lookup.id, "pos_init");
  assert.deepEqual(lookup.transition.preEntrySelectorAliases, ["FMC"]);
  assert.deepEqual(lookup.transition.entryKeys, ["INIT"]);
  assert.deepEqual(lookup.transition.recoveryKeys, ["L6"]);
  assert.ok(lookup.transition.selectorAliases.includes("POS"));
  assert.ok(lookup.verification.titleAliases.includes("POS INIT"));
});

test("page lookup recognizes VNAV page-family titles", () => {
  const route = resolvePageRoute("VNAV");

  assert.equal(pageMatchesRoute(makePage("164 LIM CLB"), route), true);
  assert.equal(pageMatchesRoute(makePage("ECON CRZ"), route), true);
  assert.equal(pageMatchesRoute(makePage("ECON DES"), route), true);
});

test("navigation uses the MENU to FMC and INIT/REF recovery path", async () => {
  const pages = [
    makePage("MENU", [{ line: { left: "<FMC" } }]),
    makePage("IDENT"),
    makePage("ACT PERF INIT"),
    makePage("INIT/REF INDEX", [{ line: { left: "<IDENT" } }, { line: { left: "<POS" } }]),
    makePage("POS INIT"),
  ];
  const keys = [];
  let pageIndex = 0;

  const result = await navigateToCduPage({
    targetPage: "POS INIT",
    cdu: 1,
    maxSteps: 8,
    stepDelayMs: 0,
    readPage: async () => pages[Math.min(pageIndex, pages.length - 1)],
    pressKey: async (key) => {
      keys.push(key);
      pageIndex += 1;
      return { eventName: `FMC_EV_${key}_1` };
    },
  });

  assert.equal(result.success, true);
  assert.deepEqual(keys, ["L1", "INIT", "L6", "L2"]);
  assert.equal(result.currentPage.title, "POS INIT");
});

test("verification returns the current page and a verification result", async () => {
  const result = await verifyCduPage({
    targetPage: "VNAV",
    cdu: 2,
    readPage: async () => makePage("ECON CRZ"),
  });

  assert.equal(result.success, true);
  assert.equal(result.verified, true);
  assert.equal(result.cdu, 2);
  assert.equal(result.currentPage.title, "ECON CRZ");
  assert.equal(result.page.title, "ECON CRZ");
});
