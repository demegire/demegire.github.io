import { loadSiteData, formatScore, createAnchorId } from "./site.js";
const medalMap = new Map([
  [1, "🥇"],
  [2, "🥈"],
  [3, "🥉"],
]);

const promptToggle = document.getElementById("prompt-toggle");
const promptListEl = document.getElementById("prompt-list");
const modelAccordionEl = document.getElementById("model-accordion");

let prompts = [];
let models = [];
const promptExplanations = new Map();
async function loadPromptExplanations() {
  try {
    const response = await fetch("prompt_explanations.csv", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load prompt explanations: ${response.status}`);
    }
    const csvText = await response.text();
    return parsePromptExplanationCsv(csvText);
  } catch (error) {
    console.warn("Failed to load prompt explanations.", error);
    return new Map();
  }
}

function parsePromptExplanationCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const map = new Map();
  if (lines.length <= 1) {
    return map;
  }
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    const columns = parseCsvLine(line);
    if (!columns.length) {
      continue;
    }
    const [uidValue, ...rest] = columns;
    const uid = (uidValue || "").trim();
    const explanation = (rest.join(",") || "").trim();
    if (!uid) {
      continue;
    }
    map.set(uid, explanation);
  }
  return map;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function setPromptExpanded(expanded) {
  if (!promptToggle || !promptListEl) {
    return;
  }
  promptToggle.setAttribute("aria-expanded", String(expanded));
  promptToggle.textContent = expanded ? "Collapse details" : "Expand details";
  promptListEl.hidden = !expanded;
  promptListEl.setAttribute("aria-hidden", String(!expanded));
  promptListEl.classList.toggle("is-collapsed", !expanded);
}

async function init() {
  if (promptToggle && promptListEl) {
    const initial = promptToggle.getAttribute("aria-expanded") === "true";
    setPromptExpanded(initial);
    promptToggle.addEventListener("click", () => {
      const expanded = promptToggle.getAttribute("aria-expanded") === "true";
      setPromptExpanded(!expanded);
    });
  }
  try {
    const [data, explanations] = await Promise.all([
      loadSiteData(),
      loadPromptExplanations(),
    ]);
    prompts = (data.prompts || []).slice().sort((a, b) => (a.uid || "").localeCompare(b.uid || ""));
    promptExplanations.clear();
    explanations.forEach((value, key) => promptExplanations.set(key, value));
    models = (data.models || []).map(mapDetailsModel);
    renderPrompts();
    renderModels();
    openHashTarget();
    window.addEventListener("hashchange", openHashTarget);
  } catch (error) {
    console.error(error);
    modelAccordionEl.innerHTML = `<p>Failed to load evaluation data.</p>`;
  }
}

function mapDetailsModel(model) {
  const vibe = model.t2I_vibe_eval ?? model.t2iVibeEval ?? {};
  const anchor = createAnchorId(model.slug);
  const images = (model.images || []).filter((img) => Boolean(img.path));
  return {
    name: model.name,
    slug: model.slug,
    anchor,
    vibe,
    images,
    rank: 0,
  };
}

function renderPrompts() {
  if (!promptListEl || !promptToggle) {
    return;
  }
  if (!prompts.length) {
    promptToggle.disabled = true;
    promptToggle.textContent = "No prompts available";
    promptListEl.hidden = true;
    return;
  }
  promptToggle.disabled = false;
  promptListEl.innerHTML = prompts
    .map((prompt, index) => {
      const references = (prompt.references || [])
        .map(
          (refPath, refIndex) =>
            `<img src="${encodeURI(refPath)}" alt="Reference ${refIndex + 1} for prompt ${index + 1}" loading="lazy" />`
        )
        .join("");
      const title = `Prompt ${index + 1}`;
      const promptText = escapeHtml(prompt.prompt || "");
      const quotedPrompt = promptText ? `&quot;${promptText}&quot;` : "";
      const explanation = promptExplanations.get(prompt.uid) || "";
      const explanationHtml = explanation
        ? `<p class="prompt-explanation">${escapeHtml(explanation)}</p>`
        : "";
      return `
        <article class="prompt-card">
          <h3 class="prompt-title">${title}</h3>
          ${quotedPrompt ? `<p class="prompt-text">${quotedPrompt}</p>` : ""}
          ${explanationHtml}
          ${references ? `<div class="prompt-references">${references}</div>` : ""}
        </article>
      `;
    })
    .join("\n");
  const expanded = promptToggle.getAttribute("aria-expanded") === "true";
  setPromptExpanded(expanded);
}

function renderModels() {
  const sorted = [...models].sort((a, b) => (b.vibe.total || 0) - (a.vibe.total || 0));
  let currentRank = 0;
  let previousScore = null;
  sorted.forEach((model, index) => {
    const score = model.vibe.total || 0;
    if (previousScore === null || score !== previousScore) {
      currentRank = index + 1;
      previousScore = score;
    }
    model.rank = currentRank;
  });
  modelAccordionEl.innerHTML = sorted.map((model) => renderModelPanel(model)).join("\n");
  attachCardInteractions();
}

function renderModelPanel(model) {
  const total = formatScore(model.vibe.total || 0);
  const badge = medalMap.get(model.rank) || `#${model.rank}`;
  const grid = model.images.length
    ? `<div class="model-grid">
        ${model.images.map((image) => renderGenerationCard(image, model)).join("\n")}
      </div>`
    : `<p>No generations captured for this model yet.</p>`;
  return `
    <details class="model-panel" id="${model.anchor}">
      <summary>
        <div class="model-summary">
          <span class="rank-badge">${badge}</span>
          <span>${escapeHtml(model.name)}</span>
        </div>
        <span class="model-score">Score: ${total}</span>
      </summary>
      <div class="model-content">
        ${grid}
      </div>
    </details>
  `;
}

function renderGenerationCard(image, model) {
  const promptTitle = image.prompt ? escapeHtml(image.prompt) : "";
  const titleAttr = promptTitle ? ` title="${promptTitle}"` : "";
  return `
    <figure class="generation-card" tabindex="0" data-model="${escapeHtml(model.slug)}" data-uid="${escapeHtml(image.uid)}"${titleAttr}>
      <img src="${encodeURI(image.path)}" alt="${escapeHtml(model.name)} prompt ${escapeHtml(image.uid)}" loading="lazy" />
      <figcaption class="generation-overlay">
        <span class="generation-score">Score: ${formatScore(image.score || 0)}</span>
        <p class="generation-comment">${escapeHtml(image.comment || "No comment provided.")}</p>
      </figcaption>
    </figure>
  `;
}

function attachCardInteractions() {
  const cards = modelAccordionEl.querySelectorAll(".generation-card");
  const prefersNoHover = window.matchMedia("(hover: none)").matches;
  cards.forEach((card) => {
    if (prefersNoHover) {
      card.addEventListener("click", () => {
        card.classList.toggle("is-active");
      });
    }
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.classList.toggle("is-active");
      }
      if (event.key === "Escape") {
        card.classList.remove("is-active");
      }
    });
  });
}

function openHashTarget() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const target = document.getElementById(hash);
  if (target && target.tagName.toLowerCase() === "details") {
    target.open = true;
    target.classList.add("is-highlight");
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => target.classList.remove("is-highlight"), 1600);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
init();
