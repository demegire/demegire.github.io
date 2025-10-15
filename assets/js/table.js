import {
  loadSiteData,
  formatCurrency,
  formatLatency,
  formatScore,
  createAnchorId,
  numericFrom,
  resolveMode,
  listModes,
} from "./site.js";

const tableHead = document.getElementById("model-table-head");
const tableBody = document.querySelector("#model-table tbody");
const datasetNavEl = document.getElementById("dataset-nav");
const heroTitleEl = document.getElementById("hero-title");
const heroSubtitleEl = document.getElementById("hero-subtitle");
const tableTipEl = document.getElementById("table-tip");
const primaryNavBenchmarkLink = document.querySelector('.nav-tabs--primary a[href$="vibe-eval.html"]');

const urlMode = new URLSearchParams(window.location.search).get("mode");
const defaultMode = document.body?.dataset?.defaultMode || null;
const requestedMode = urlMode || defaultMode;

const state = {
  modeSlug: null,
  modePayload: null,
  benchmark: null,
  columns: [],
  rows: [],
  sortKey: null,
  sortDirection: "desc",
  filters: new Map(),
  sortButtons: [],
  filterInputs: [],
};

async function init() {
  try {
    const data = await loadSiteData();
    const resolved = resolveMode(data, requestedMode);
    state.modeSlug = resolved.slug;
    state.modePayload = resolved.payload;
    if (!state.modeSlug || !state.modePayload) {
      throw new Error("No model data available.");
    }
    state.benchmark = state.modePayload.benchmark || { slug: "vibe", name: "Vibe Eval" };
    configureDatasetNav(data);
    updatePrimaryNav();
    updateHero();
    state.columns = buildColumns(state.modePayload, state.modeSlug);
    state.rows = (state.modePayload.models || []).map((model) => mapRow(model, state.modePayload, state.benchmark));
    setInitialSort();
    renderTableHead();
    render();
  } catch (error) {
    console.error(error);
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="4">Failed to load model data.</td></tr>`;
    }
    if (datasetNavEl) {
      datasetNavEl.innerHTML = `<span class="nav-tab" aria-disabled="true">Unavailable</span>`;
    }
  }
}

function configureDatasetNav(data) {
  if (!datasetNavEl) {
    return;
  }
  const modes = listModes(data);
  if (!modes.length) {
    datasetNavEl.innerHTML = `<span class="nav-tab" aria-disabled="true">No datasets</span>`;
    return;
  }
  datasetNavEl.innerHTML = modes
    .map(({ slug, payload }) => {
      const label = payload?.label || slug.toUpperCase();
      if (slug === state.modeSlug) {
        return `<a class="nav-tab nav-tab--active" href="${encodeURI(buildModeUrl(slug))}" aria-current="page">${escapeHtml(
          label
        )}</a>`;
      }
      return `<a class="nav-tab" href="${encodeURI(buildModeUrl(slug))}">${escapeHtml(label)}</a>`;
    })
    .join("");
}

function updatePrimaryNav() {
  if (!primaryNavBenchmarkLink || !state.modeSlug) {
    return;
  }
  primaryNavBenchmarkLink.setAttribute("href", `${state.modeSlug}-vibe-eval.html`);
}

function updateHero() {
  if (heroTitleEl && state.modePayload?.title) {
    heroTitleEl.textContent = `${state.modePayload.title} Model Explorer`;
  }
  if (heroSubtitleEl && state.modePayload?.label) {
    heroSubtitleEl.textContent = `Compare generation cost, latency, and scores across ${state.modePayload.label} models.`;
  }
  if (tableTipEl && state.modePayload?.label) {
    tableTipEl.textContent = `Tip: Click the vibe score badge to jump directly to that model inside the ${state.modePayload.label} benchmark breakdown.`;
  }
}

function buildColumns(modePayload, modeSlug) {
  const columns = [
    {
      key: "name",
      label: "Model",
      type: "text",
      sortable: true,
      filterable: true,
      defaultSort: false,
    },
  ];

  const statsHeaders = (modePayload.statsHeaders || []).filter((header) => header.key !== "link");
  statsHeaders.forEach((header) => {
    columns.push({
      key: header.key,
      label: header.label,
      href: header.href || header.url || null,
      type: header.value_type || "number",
      sortable: true,
      filterable: true,
      defaultSort: false,
    });
  });

  const benchmarkHref =
    modePayload?.benchmark?.href ||
    (modeSlug ? `${modeSlug}-vibe-eval.html` : null);

  columns.push({
    key: "benchmarkTotal",
    label: modePayload.benchmark?.name || "Benchmark Score",
    href: benchmarkHref,
    type: "score",
    sortable: true,
    filterable: true,
    defaultSort: true,
  });

  return columns;
}

function mapRow(model, modePayload, benchmark) {
  const stats = model.stats || {};
  const benchmarkSlug = benchmark.slug || "vibe";
  const benchmarkEntry = (model.benchmarks || {})[benchmarkSlug] || {};
  const headers = (modePayload.statsHeaders || []).filter((header) => header.key !== "link");

  const row = {
    slug: model.slug,
    anchor: createAnchorId(model.slug),
    name: model.name,
    statsLink: stats.link || null,
    source: model.slug,
    benchmarkTotal: numericFrom(benchmarkEntry.total) ?? 0,
  };

  headers.forEach((header) => {
    const value = stats[header.key];
    row[header.key] = value === null || value === undefined ? null : numericFrom(value);
  });

  return row;
}

function setInitialSort() {
  const defaultColumn = state.columns.find((column) => column.defaultSort) || state.columns.find((column) => column.sortable);
  if (defaultColumn) {
    state.sortKey = defaultColumn.key;
    state.sortDirection = "desc";
  }
}

function renderTableHead() {
  if (!tableHead) {
    return;
  }
  const headerRowHtml = `
    <tr>
      ${state.columns
        .map((column) => {
          if (!column.sortable) {
            return `<th scope="col"><div class="header-cell">${renderHeaderLabel(column)}</div></th>`;
          }
          const direction = column.key === state.sortKey ? state.sortDirection : "";
          const ariaLabel = `Sort by ${column.label}${direction ? ` (${direction === "asc" ? "ascending" : "descending"})` : ""}`;
          return `
            <th scope="col">
              <div class="header-cell">
                ${renderHeaderLabel(column)}
                <button class="sort-button" type="button" data-key="${escapeHtml(column.key)}" data-direction="${direction}" aria-label="${escapeHtml(
            ariaLabel
          )}">&#8597;</button>
              </div>
            </th>
          `;
        })
        .join("")}
    </tr>
  `;

  const filterRowHtml = `
    <tr class="filters">
      ${state.columns
        .map((column) => {
          if (!column.filterable) {
            return "<th></th>";
          }
          const placeholder = getFilterPlaceholder(column);
          return `<th><input class="column-filter" type="text" data-key="${escapeHtml(column.key)}" placeholder="${escapeHtml(placeholder)}" /></th>`;
        })
        .join("")}
    </tr>
  `;

  tableHead.innerHTML = headerRowHtml + filterRowHtml;
  state.sortButtons = Array.from(document.querySelectorAll(".sort-button"));
  state.filterInputs = Array.from(document.querySelectorAll(".column-filter"));
  attachHeaderListeners();
  updateSortButtons();
}

function attachHeaderListeners() {
  state.sortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.key;
      if (!key) {
        return;
      }
      if (state.sortKey === key) {
        state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDirection = "desc";
      }
      updateSortButtons();
      render();
    });
  });

  state.filterInputs.forEach((input) => {
    input.addEventListener("input", (event) => {
      const target = event.currentTarget;
      const key = target.dataset.key;
      state.filters.set(key, target.value);
      render();
    });
  });
}

function render() {
  if (!tableBody) {
    return;
  }
  const filtered = state.rows.filter((row) => matchesFilters(row));
  const sorted = filtered.sort((a, b) => compareRows(a, b));
  if (!sorted.length) {
    tableBody.innerHTML = `<tr><td colspan="${state.columns.length}">No models match the applied filters.</td></tr>`;
    return;
  }
  tableBody.innerHTML = sorted.map((row) => renderRow(row)).join("\n");
}

function renderRow(row) {
  const cells = state.columns.map((column) => renderCell(row, column)).join("\n");
  return `<tr>${cells}</tr>`;
}

function renderCell(row, column) {
  if (column.key === "name") {
    const statsHref = row.statsLink ? encodeURI(row.statsLink) : null;
    const label = escapeHtml(row.name);
    const cellContent = statsHref
      ? `<a class="model-name-link" href="${statsHref}" target="_blank" rel="noopener">${label}</a>`
      : `<span>${label}</span>`;
    return `<td>${cellContent}</td>`;
  }

  if (column.key === "benchmarkTotal") {
    const scoreValue = formatScore(row.benchmarkTotal);
    const targetHref = `${state.modeSlug}-vibe-eval.html#${row.anchor}`;
    const ariaLabel = `View ${row.name} in benchmark`;
    return `<td><a class="score-link" href="${encodeURI(targetHref)}" aria-label="${escapeHtml(ariaLabel)}">${scoreValue}</a></td>`;
  }

  return `<td>${formatValue(row[column.key], column.type)}</td>`;
}

function matchesFilters(row) {
  for (const [key, value] of state.filters.entries()) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const column = state.columns.find((col) => col.key === key);
    if (!column) continue;
    if (isNumericColumn(column)) {
      if (!matchesNumericFilter(row[column.key], trimmed)) {
        return false;
      }
    } else if (!matchesTextFilter(row, key, trimmed)) {
      return false;
    }
  }
  return true;
}

function matchesTextFilter(row, key, query) {
  const value = row[key];
  const combined = `${value ?? ""} ${row.source ?? ""}`.toLowerCase();
  return combined.includes(query.toLowerCase());
}

const comparatorPattern = /^(>=|<=|>|<|!=|==|=)\s*(-?\d+(?:\.\d+)?)/;
const rangePattern = /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/;

function matchesNumericFilter(value, query) {
  if (query.toLowerCase() === "null") {
    return value === null || value === undefined || Number.isNaN(value);
  }
  const numericValue = typeof value === "number" && !Number.isNaN(value) ? value : Number(value);
  const isNumber = !Number.isNaN(numericValue);
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
  const column = state.columns.find((col) => col.key === state.sortKey);
  if (!column) {
    return 0;
  }
  const multiplier = state.sortDirection === "asc" ? 1 : -1;
  const valA = getSortValue(a, column);
  const valB = getSortValue(b, column);

  if (valA == null && valB == null) return 0;
  if (valA == null) return 1;
  if (valB == null) return -1;

  if (typeof valA === "string" || typeof valB === "string") {
    return valA.toString().localeCompare(valB.toString(), undefined, { sensitivity: "base" }) * multiplier;
  }

  if (valA === valB) return 0;
  return valA > valB ? multiplier : -multiplier;
}

function getSortValue(row, column) {
  if (column.key === "name") {
    return row.name || "";
  }
  if (column.key === "benchmarkTotal") {
    return typeof row.benchmarkTotal === "number" ? row.benchmarkTotal : null;
  }
  return row[column.key];
}

function updateSortButtons() {
  state.sortButtons.forEach((button) => {
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

function getFilterPlaceholder(column) {
  if (!isNumericColumn(column)) {
    return "Filter";
  }
  switch (column.type) {
    case "currency":
      return "e.g. <=0.05";
    case "duration":
      return "e.g. <10";
    case "score":
      return "e.g. >20";
    case "integer":
      return "e.g. >=1100";
    default:
      return "e.g. 5-15";
  }
}

function formatValue(value, type) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "\u2013";
  }
  switch (type) {
    case "currency":
      return formatCurrency(value);
    case "duration":
      return formatLatency(value);
    case "integer":
      return String(Math.round(value));
    case "score":
      return formatScore(value);
    case "number":
    default:
      if (typeof value !== "number" || Number.isNaN(value)) {
        return "\u2013";
      }
      return value % 1 === 0 ? String(value) : value.toFixed(value >= 1 ? 2 : 3);
  }
}

function isNumericColumn(column) {
  return ["currency", "duration", "integer", "number", "score"].includes(column.type);
}

function buildModeUrl(slug) {
  const base = "model-explorer.html";
  return `./${base}?mode=${encodeURIComponent(slug)}`;
}

function renderHeaderLabel(column) {
  const label = escapeHtml(column.label);
  if (column.href) {
    const href = encodeURI(column.href);
    return `<a class="header-link header-label" href="${href}" target="_blank" rel="noopener">${label}</a>`;
  }
  return `<span class="header-label">${label}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

init();
