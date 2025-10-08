import {
  loadSiteData,
  formatCurrency,
  formatLatency,
  formatScore,
  createAnchorId,
  numericFrom,
} from "./site.js";

const EXTERNAL_LEADERBOARD_URL = "https://artificialanalysis.ai/image/leaderboard/text-to-image";

const numericColumns = new Set([
  "costPerImage",
  "costPerMegapixel",
  "p90Latency",
  "t2iTotal",
  "elo",
]);

const state = {
  rows: [],
  sortKey: "t2iTotal",
  sortDirection: "desc",
  filters: new Map(),
};

const tableBody = document.querySelector("#model-table tbody");
const sortButtons = Array.from(document.querySelectorAll(".sort-button"));
const filterInputs = Array.from(document.querySelectorAll(".column-filter"));

async function init() {
  try {
    const data = await loadSiteData();
    state.rows = data.models.map(mapRow);
    render();
  } catch (error) {
    console.error(error);
    tableBody.innerHTML = `<tr><td colspan="6">Failed to load model data.</td></tr>`;
  }
}

function mapRow(model) {
  const stats = model.stats || {};
  const vibe = model.t2iVibeEval || {};
  return {
    slug: model.slug,
    anchor: createAnchorId(model.slug),
    name: model.name,
    statsLink: stats.link || null,
    source: model.slug,
    costPerImage: numericFrom(stats.costPerImage),
    costPerMegapixel: numericFrom(stats.costPerMegapixel),
    p90Latency: numericFrom(stats.p90Latency),
    t2iTotal: numericFrom(vibe.total) ?? 0,
    elo: numericFrom(stats.elo),
  };
}

function render() {
  const filtered = state.rows.filter((row) => matchesFilters(row));
  const sorted = filtered.sort((a, b) => compareRows(a, b));
  tableBody.innerHTML = sorted.map((row) => renderRow(row)).join("\n");
  updateSortButtons();
}

function renderRow(row) {
  const statsHref = row.statsLink ? encodeURI(row.statsLink) : null;
  const nameLabel = escapeHtml(row.name);
  const nameCell = statsHref
    ? `<a class="model-name-link" href="${statsHref}" target="_blank" rel="noopener">${nameLabel}</a>`
    : `<span>${nameLabel}</span>`;
  const scoreValue = formatScore(row.t2iTotal);
  const scoreLabel = "View " + nameLabel + " in benchmark";
  const eloCell = row.elo != null
    ? `<a href="${EXTERNAL_LEADERBOARD_URL}" target="_blank" rel="noopener">${formatScore(row.elo)}</a>`
    : "\u2013";
  return `
    <tr>
      <td>${nameCell}</td>
      <td>${formatCurrency(row.costPerImage)}</td>
      <td>${formatCurrency(row.costPerMegapixel)}</td>
      <td>${formatLatency(row.p90Latency)}</td>
      <td>
        <a class="score-link" href="t2i-vibe-eval.html#${row.anchor}" aria-label="${scoreLabel}">${scoreValue}</a>
      </td>
      <td>${eloCell}</td>
    </tr>
  `;
}

function updateSortButtons() {
  sortButtons.forEach((button) => {
    const key = button.dataset.key;
    if (key === state.sortKey) {
      button.dataset.direction = state.sortDirection;
      button.setAttribute(
        "aria-label",
        `Sort by ${button.previousElementSibling?.textContent || key} (${state.sortDirection === "asc" ? "ascending" : "descending"})`
      );
    } else {
      button.dataset.direction = "";
      button.setAttribute("aria-label", `Sort by ${button.previousElementSibling?.textContent || key}`);
    }
  });
}

function matchesFilters(row) {
  for (const [key, value] of state.filters.entries()) {
    if (!value) continue;
    const rawValue = value.trim();
    if (!rawValue) continue;
    if (numericColumns.has(key)) {
      if (!matchesNumericFilter(row[key], rawValue)) {
        return false;
      }
    } else if (!matchesTextFilter(row[key], rawValue, row)) {
      return false;
    }
  }
  return true;
}

function matchesTextFilter(value, query, row) {
  const combined = `${value ?? ""} ${row.source ?? ""}`.toLowerCase();
  return combined.includes(query.toLowerCase());
}

const comparatorPattern = /^(>=|<=|>|<|!=|==|=)\s*(-?\d+(?:\.\d+)?)/;
const rangePattern = /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/;

function matchesNumericFilter(value, query) {
  if (query.toLowerCase() === "null") {
    return value === null || value === undefined || Number.isNaN(value);
  }

  const hasNativeNumber = typeof value === "number" && !Number.isNaN(value);
  let numericValue = hasNativeNumber ? value : Number(value);
  let isNumber = hasNativeNumber;

  if (!hasNativeNumber) {
    if (value === null || value === undefined || value === "" || value === "–") {
      isNumber = false;
    } else if (!Number.isNaN(numericValue)) {
      isNumber = true;
    }
  }

  const trimmed = query.replace(/\s+/g, "").toLowerCase();

  const comparatorMatch = trimmed.match(comparatorPattern);
  if (comparatorMatch && isNumber) {
    const [, op, rawTarget] = comparatorMatch;
    const target = Number(rawTarget);
    switch (op) {
      case ">":
        return numericValue > target;
      case ">=":
        return numericValue >= target;
      case "<":
        return numericValue < target;
      case "<=":
        return numericValue <= target;
      case "=":
      case "==":
        return numericValue === target;
      case "!=":
        return numericValue !== target;
      default:
        break;
    }
  }

  const rangeMatch = trimmed.match(rangePattern);
  if (rangeMatch && isNumber) {
    const [, start, end] = rangeMatch;
    const lower = Number(start);
    const upper = Number(end);
    return numericValue >= Math.min(lower, upper) && numericValue <= Math.max(lower, upper);
  }

  if (!trimmed) {
    return true;
  }

  if (!isNumber) {
    return false;
  }

  const plainNumber = Number(trimmed);
  if (!Number.isNaN(plainNumber)) {
    return numericValue === plainNumber;
  }

  const formatted = String(value ?? "").toLowerCase();
  return formatted.includes(query.toLowerCase());
}

function compareRows(a, b) {
  const { sortKey, sortDirection } = state;
  const multiplier = sortDirection === "asc" ? 1 : -1;
  const valA = a[sortKey];
  const valB = b[sortKey];

  if (valA == null && valB == null) return 0;
  if (valA == null) return 1;
  if (valB == null) return -1;

  if (typeof valA === "string" || typeof valB === "string") {
    return valA.toString().localeCompare(valB.toString(), undefined, { sensitivity: "base" }) * multiplier;
  }

  if (valA === valB) return 0;
  return valA > valB ? multiplier : -multiplier;
}

sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.key;
    if (state.sortKey === key) {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = key;
      state.sortDirection = key === "name" ? "asc" : "desc";
    }
    render();
  });
});

filterInputs.forEach((input) => {
  input.addEventListener("input", (event) => {
    const target = event.currentTarget;
    const key = target.dataset.key;
    state.filters.set(key, target.value);
    render();
  });
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
init();

