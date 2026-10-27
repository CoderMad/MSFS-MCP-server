// CDU Page Parser - decodes InspectHTML GETALL response into structured CDU display
// Handles HTML entities, custom [s-text]/[s]...[/s] markup, and reconstructs page layout

/**
 * Decode HTML entities to plain UTF-8 text
 */
function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Strip custom FMC markup tags:
 *   [s-text]    — small-text suffix marker (remove entirely)
 *   [s]...[/s]  — small-text wrapper (keep inner text)
 *   <span>...</span> and other HTML tags
 */
function stripFmcMarkup(str) {
  if (!str) return "";
  return str
    .replace(/\[s-text\]/g, "")
    .replace(/\[s\](.*?)\[\/s\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * Full cleanup pipeline: decode entities -> strip markup
 */
function cleanValue(raw) {
  if (!raw || raw === "_empty_") return "";
  return stripFmcMarkup(decodeHtmlEntities(raw));
}

/**
 * Normalize CDU text for page/key matching.
 * Keeps the comparison insensitive to case, HTML formatting, and separators
 * such as the slash in "INIT/REF" or "DEP/ARR".
 */
function normalizePageText(value) {
  return cleanValue(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const CDU_COLS = 24;

/**
 * Compose a single display row from left, center, right cell values.
 */
function composeRow(left, center, right, width) {
  left = left || "";
  center = center || "";
  right = right || "";
  if (!left && !center && !right) return "";

  if (!center) {
    const gap = Math.max(0, width - left.length - right.length);
    return left + " ".repeat(gap) + right;
  }

  const centerStart = Math.max(0, Math.floor((width - center.length) / 2));
  let row = " ".repeat(width);
  row = left + row.substring(left.length);
  const before = row.substring(0, centerStart);
  const after = row.substring(centerStart + center.length);
  row = before + center + after;
  if (right) {
    const rStart = Math.max(0, width - right.length);
    row = row.substring(0, rStart) + right;
  }
  return row;
}

/**
 * Parse GETALL JSON response and build structured CDU page object.
 * Accepts either:
 *   - { ids:[], values:[] } format
 *   - flat { "title": "...", "line-0-left": "...", ... } format
 */
function parseCduPage(parsed, cduNum) {
  const page = {
    cdu: cduNum,
    instrument: "AS05B_FMC_" + cduNum,
  };

  // Normalize to a flat key->value map
  let kvMap = {};
  if (parsed.ids && parsed.values) {
    for (let i = 0; i < parsed.ids.length; i++) {
      kvMap[parsed.ids[i].replace("Get ", "")] = parsed.values[i];
    }
  } else {
    kvMap = { ...parsed };
  }

  // Extract and clean all fields
  const get = (k) => cleanValue(kvMap[k] || "");

  page.title = get("title");
  page.pageCurrent = get("page-current");
  page.pageCount = get("page-count");
  page.scratchpad = get("in-out");

  // Build the 6 label/line row pairs
  page.rows = [];
  for (let r = 0; r < 6; r++) {
    page.rows.push({
      label: {
        left: get("label-" + r + "-left"),
        center: get("label-" + r + "-center"),
        right: get("label-" + r + "-right"),
      },
      line: {
        left: get("line-" + r + "-left"),
        center: get("line-" + r + "-center"),
        right: get("line-" + r + "-right"),
      },
    });
  }

  // Reconstruct a text display of the CDU screen
  const W = CDU_COLS;
  const display = [];

  // Title bar
  const titleRight =
    page.pageCurrent && page.pageCount
      ? page.pageCurrent + "/" + page.pageCount
      : "";
  display.push(composeRow("", page.title, titleRight, W));

  // 6 row pairs (label + data)
  for (let r = 0; r < 6; r++) {
    const lbl = page.rows[r].label;
    const ln = page.rows[r].line;
    const labelRow = composeRow(lbl.left, lbl.center, lbl.right, W);
    const lineRow = composeRow(ln.left, ln.center, ln.right, W);
    if (labelRow.trim() || lineRow.trim()) {
      display.push(labelRow);
      display.push(lineRow);
    }
  }

  // Scratchpad separator + scratchpad
  display.push("________________________");
  display.push(page.scratchpad || "");

  page.display = display.join("\n");

  return page;
}

module.exports = {
  decodeHtmlEntities,
  stripFmcMarkup,
  cleanValue,
  normalizePageText,
  parseCduPage,
  composeRow,
};
