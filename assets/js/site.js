const DATA_URL = "data/site-data.json";
let __siteDataCache = null;

export async function loadSiteData() {
  if (__siteDataCache) {
    return __siteDataCache;
  }
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load site data: ${response.status}`);
  }
  __siteDataCache = await response.json();
  return __siteDataCache;
}

export function formatCurrency(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "\u2013";
  }
  return "$" + value.toFixed(3);
}

export function formatLatency(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "\u2013";
  }
  return `${value.toFixed(2)} s`;
}

export function formatScore(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0";
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2);
}

export function formatAverage(avg, count) {
  if (!count) {
    return "0";
  }
  if (typeof avg !== "number" || Number.isNaN(avg)) {
    return "0";
  }
  return avg.toFixed(avg >= 1 ? 2 : 3);
}

export function createAnchorId(slug) {
  return slug.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

export function numericFrom(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
