// CDU key mapping and page navigation helpers.
//
// The MSFS SDK exposes aircraft-specific InputEvents at runtime. The logical
// key map below therefore produces candidate event names; the live event cache
// resolves those names to the aircraft's hash before a key is pressed.

const {
  normalizePageText,
} = require("./cdu_parser");

const FUNCTION_KEYS = [
  "INIT",
  "RTE",
  "DEPARR",
  "VNAV",
  "FIX",
  "LEGS",
  "HOLD",
  "PROG",
  "MENU",
  "NAVRAD",
  "FMCCOMM",
  "ATC",
  "EXEC",
  "PREVPAGE",
  "NEXTPAGE",
  "CLR",
  "DEL",
  "SP",
  "DIV",
  "DOT",
  "PLUSMINUS",
];

const LSK_KEYS = [
  ...Array.from({ length: 6 }, (_, i) => "L" + (i + 1)),
  ...Array.from({ length: 6 }, (_, i) => "R" + (i + 1)),
];

const CDU_KEY_ALIASES = Object.freeze({
  "DEP/ARR": "DEPARR",
  "DEP ARR": "DEPARR",
  "NAV RAD": "NAVRAD",
  "NAV RADIO": "NAVRAD",
  "PREV PAGE": "PREVPAGE",
  "NEXT PAGE": "NEXTPAGE",
  "FMC COMM": "FMCCOMM",
  "PLUS MINUS": "PLUSMINUS",
  "PLUS/MINUS": "PLUSMINUS",
  "SPACE": "SP",
  "DELETE": "DEL",
  // The CDU slash key is exposed by the aircraft as FMC_EV_DIV_*, so accept the
  // literal character callers actually type.
  "/": "DIV",
});

const CDU_KEY_EVENT_MAP = Object.freeze(
  [...FUNCTION_KEYS, ...LSK_KEYS].reduce((map, key) => {
    map[key] = Object.freeze({
      eventName: (cdu) => `FMC_EV_${key}_${cdu}`,
    });
    return map;
  }, {})
);

function normalizeKeyName(key) {
  const raw = String(key || "").trim().toUpperCase();
  return CDU_KEY_ALIASES[raw] || raw.replace(/[\s/-]+/g, "");
}

function getCduKeyCandidates(key, cdu = 1) {
  const normalized = normalizeKeyName(key);
  const definition = CDU_KEY_EVENT_MAP[normalized];
  const preferred = definition
    ? definition.eventName(cdu)
    : `FMC_EV_${normalized}_${cdu}`;

  return [
    preferred,
    `FMC_EV_${normalized}`,
    `${normalized}_${cdu}`,
    normalized,
  ];
}

function resolveCduKeyEvent(cache, key, cdu = 1) {
  for (const eventName of getCduKeyCandidates(key, cdu)) {
    if (cache.has(eventName)) {
      return { key: normalizeKeyName(key), eventName, descriptor: cache.get(eventName) };
    }
  }

  const normalizedCandidates = new Set(
    getCduKeyCandidates(key, cdu).map((candidate) => normalizeKeyName(candidate))
  );
  for (const [eventName, descriptor] of cache) {
    if (normalizedCandidates.has(normalizeKeyName(eventName))) {
      return { key: normalizeKeyName(key), eventName, descriptor };
    }
  }

  return null;
}

function titleMatches(page, aliases) {
  const title = normalizePageText(page && page.title);
  return aliases.some((alias) => {
    const normalizedAlias = normalizePageText(alias);
    return title === normalizedAlias || title.includes(normalizedAlias);
  });
}

function cellMatches(cell, aliases) {
  const value = normalizePageText(cell);
  return aliases.some((alias) => {
    const normalizedAlias = normalizePageText(alias);
    return value === normalizedAlias || value.includes(normalizedAlias);
  });
}

function findLineSelectKey(page, aliases) {
  if (!page || !Array.isArray(page.rows)) return null;

  for (let row = 0; row < page.rows.length && row < 6; row++) {
    const entry = page.rows[row] || {};
    const label = entry.label || {};
    const line = entry.line || {};

    if (cellMatches(`${label.left} ${line.left}`, aliases)) return `L${row + 1}`;
    if (cellMatches(`${label.right} ${line.right}`, aliases)) return `R${row + 1}`;
    if (cellMatches(`${label.center} ${line.center}`, aliases)) {
      // Center text is not line-selectable. Keep scanning the selectable
      // columns rather than guessing a side.
      continue;
    }
  }

  return null;
}

const CDU_PAGE_ROUTES = Object.freeze([
  {
    id: "menu",
    aliases: ["menu", "cdu menu"],
    entryKeys: ["MENU"],
    titleAliases: ["MENU"],
  },
  {
    id: "init_ref",
    aliases: ["init", "init ref", "initialization", "initialization reference"],
    entryKeys: ["INIT"],
    indexKeys: ["L6"],
    titleAliases: ["INIT REF", "INIT/REF", "INIT/REF INDEX"],
  },
  {
    id: "perf_init",
    aliases: ["perf init", "performance init", "performance initialization"],
    entryKeys: ["INIT"],
    selectorAliases: ["PERF INIT", "PERFORMANCE INIT"],
    titleAliases: ["PERF INIT", "PERFORMANCE INIT", "ACT PERF INIT"],
  },
  {
    id: "pos_init",
    aliases: ["pos init", "position init", "position initialization"],
    entryKeys: ["INIT"],
    indexKeys: ["L6"],
    selectorAliases: ["POS", "POS INIT", "POSITION INIT"],
    titleAliases: ["POS INIT", "POSITION INIT"],
  },
  {
    id: "takeoff_ref",
    aliases: ["takeoff ref", "takeoff reference"],
    entryKeys: ["INIT"],
    indexKeys: ["L6"],
    selectorAliases: ["TAKEOFF", "TAKEOFF REF", "TAKEOFF REFERENCE"],
    titleAliases: ["TAKEOFF REF", "TAKEOFF REFERENCE"],
  },
  {
    id: "rte",
    aliases: ["rte", "route", "route page"],
    entryKeys: ["RTE"],
    titleAliases: ["RTE", "ROUTE"],
  },
  {
    id: "dep_arr",
    aliases: ["dep arr", "dep/arr", "departure arrival", "departure/arrival"],
    entryKeys: ["DEPARR"],
    titleAliases: ["DEP ARR", "DEP/ARR", "DEPARTURE ARRIVAL"],
  },
  {
    id: "legs",
    aliases: ["legs", "legs page"],
    entryKeys: ["LEGS"],
    titleAliases: ["LEGS"],
  },
  {
    id: "hold",
    aliases: ["hold", "hold page"],
    entryKeys: ["HOLD"],
    titleAliases: ["HOLD"],
  },
  {
    id: "prog",
    aliases: ["prog", "progress", "progress page"],
    entryKeys: ["PROG"],
    titleAliases: ["PROG", "PROGRESS", "RTA PROGRESS", "RNP PROGRESS", "FUEL PROGRESS"],
  },
  {
    id: "fix",
    aliases: ["fix", "fix page"],
    entryKeys: ["FIX"],
    titleAliases: ["FIX"],
  },
  {
    id: "navrad",
    aliases: ["navrad", "nav rad", "nav radio"],
    entryKeys: ["NAVRAD"],
    titleAliases: ["NAV RAD", "NAV RADIO"],
  },
  {
    id: "vnav",
    aliases: ["vnav", "vnav page"],
    entryKeys: ["VNAV"],
    titleAliases: ["VNAV", "LIM CLB", "ECON CRZ", "ECON DES"],
  },
]);

function resolvePageRoute(targetPage) {
  const target = normalizePageText(targetPage);
  const route = CDU_PAGE_ROUTES.find((candidate) =>
    candidate.id === String(targetPage || "").trim().toLowerCase() ||
    candidate.aliases.some((alias) => normalizePageText(alias) === target)
  );

  if (!route) {
    throw new Error(
      `Unknown CDU page '${targetPage}'. Available targets: ` +
      CDU_PAGE_ROUTES.map((candidate) => candidate.id).join(", ")
    );
  }
  return route;
}

function getCduPageLookup(targetPage) {
  const route = typeof targetPage === "object" ? targetPage : resolvePageRoute(targetPage);
  const preEntrySelectorAliases =
    route.preEntrySelectorAliases ||
    (route.id === "menu" ? [] : ["FMC"]);

  return {
    id: route.id,
    aliases: [...route.aliases],
    transition: {
      preEntrySelectorAliases: [...preEntrySelectorAliases],
      entryKeys: [...route.entryKeys],
      recoveryKeys: [...(route.indexKeys || [])],
      selectorAliases: [...(route.selectorAliases || [])],
    },
    verification: {
      titleAliases: [...route.titleAliases],
    },
  };
}

function pageMatchesRoute(page, route) {
  return titleMatches(page, route.titleAliases);
}

function summarizePage(page) {
  return {
    title: page && page.title || "",
    pageCurrent: page && page.pageCurrent || "",
    pageCount: page && page.pageCount || "",
  };
}

function pageSignature(page) {
  const summary = summarizePage(page);
  return `${summary.title}|${summary.pageCurrent}|${summary.pageCount}`;
}

async function navigateToCduPage({
  targetPage,
  cdu = 1,
  readPage,
  pressKey,
  maxSteps = 8,
  stepDelayMs = 350,
}) {
  const route = resolvePageRoute(targetPage);
  const steps = [];
  let page = await readPage(cdu);

  if (pageMatchesRoute(page, route)) {
    return {
      success: true,
      alreadyThere: true,
      cdu,
      targetPage: route.id,
      lookup: getCduPageLookup(route),
      currentPage: summarizePage(page),
      steps,
    };
  }

  async function execute(key, reason) {
    if (steps.length >= maxSteps) {
      throw new Error(`CDU navigation exceeded maxSteps=${maxSteps}`);
    }

    const result = await pressKey(key, cdu);
    steps.push({
      step: steps.length + 1,
      key,
      eventName: result.eventName,
      reason,
    });

    if (stepDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, stepDelayMs));
    }
    page = await readPage(cdu);
    return page;
  }

  const lookup = getCduPageLookup(route);
  if (titleMatches(page, ["MENU"])) {
    const fmcKey = findLineSelectKey(page, lookup.transition.preEntrySelectorAliases);
    if (fmcKey) {
      await execute(fmcKey, "select FMC");
    }
  }

  for (const key of route.entryKeys) {
    await execute(key, "page entry");
    if (pageMatchesRoute(page, route)) {
      return { success: true, alreadyThere: false, cdu, targetPage: route.id, lookup: getCduPageLookup(route), currentPage: summarizePage(page), steps };
    }
  }

  for (const key of route.indexKeys || []) {
    if (pageMatchesRoute(page, route)) {
      return { success: true, alreadyThere: false, cdu, targetPage: route.id, lookup: getCduPageLookup(route), currentPage: summarizePage(page), steps };
    }
    await execute(key, "lookup recovery");
    if (pageMatchesRoute(page, route)) {
      return { success: true, alreadyThere: false, cdu, targetPage: route.id, lookup: getCduPageLookup(route), currentPage: summarizePage(page), steps };
    }
  }

  const selectorAliases = route.selectorAliases || route.aliases;
  const visited = new Set([pageSignature(page)]);

  while (steps.length < maxSteps) {
    const lineSelectKey = findLineSelectKey(page, selectorAliases);
    if (lineSelectKey) {
      await execute(lineSelectKey, "target page selector");
      if (pageMatchesRoute(page, route)) {
        return { success: true, alreadyThere: false, cdu, targetPage: route.id, lookup: getCduPageLookup(route), currentPage: summarizePage(page), steps };
      }
    }

    const beforeNext = pageSignature(page);
    await execute("NEXTPAGE", "scan next CDU page");
    const afterNext = pageSignature(page);
    if (pageMatchesRoute(page, route)) {
      return { success: true, alreadyThere: false, cdu, targetPage: route.id, lookup: getCduPageLookup(route), currentPage: summarizePage(page), steps };
    }
    if (beforeNext === afterNext || visited.has(afterNext)) break;
    visited.add(afterNext);
  }

  return {
    success: false,
    alreadyThere: false,
    cdu,
    targetPage: route.id,
    lookup: getCduPageLookup(route),
    currentPage: summarizePage(page),
    steps,
    error: `Unable to confirm CDU page '${route.id}' after ${steps.length} step(s).`,
  };
}

async function verifyCduPage({
  targetPage,
  cdu = 1,
  readPage,
}) {
  const route = resolvePageRoute(targetPage);
  const page = await readPage(cdu);
  const verified = pageMatchesRoute(page, route);
  return {
    success: true,
    verified,
    cdu,
    targetPage: route.id,
    lookup: getCduPageLookup(route),
    currentPage: summarizePage(page),
    page,
  };
}

module.exports = {
  CDU_KEY_EVENT_MAP,
  CDU_PAGE_ROUTES,
  getCduKeyCandidates,
  getCduPageLookup,
  normalizeKeyName,
  resolveCduKeyEvent,
  resolvePageRoute,
  findLineSelectKey,
  navigateToCduPage,
  pageMatchesRoute,
  summarizePage,
  verifyCduPage,
};
