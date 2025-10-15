import { loadSiteData, formatScore, createAnchorId, resolveMode, listModes } from "./site.js";

const medalMap = new Map([
  [1, "🥇"],
  [2, "🥈"],
  [3, "🥉"],
]);

const promptToggle = document.getElementById("prompt-toggle");
const promptListEl = document.getElementById("prompt-list");
const modelAccordionEl = document.getElementById("model-accordion");
const datasetNavEl = document.getElementById("dataset-nav");
const benchmarkSummaryEl = document.getElementById("benchmark-summary");
const benchmarkHeadingEl = document.getElementById("benchmark-heading");
const leaderboardHeadingEl = document.getElementById("leaderboard-heading");
const requestedMode = document.body?.dataset?.mode || null;

let modeSlug = null;
let modePayload = null;
let prompts = [];
let models = [];

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
    const data = await loadSiteData();
    const resolved = resolveMode(data, requestedMode);
    modeSlug = resolved.slug;
    modePayload = resolved.payload;
    if (!modeSlug || !modePayload) {
      throw new Error("No evaluation data available.");
    }
    buildDatasetNav(data);

    prompts = (modePayload.prompts || [])
      .slice()
      .sort((a, b) => (a.uid || "").localeCompare(b.uid || ""));
    models = (modePayload.models || []).map((model) => mapDetailsModel(model, modePayload));
    updateBenchmarkCopy();
    renderPrompts();
    renderModels();
    openHashTarget();
    window.addEventListener("hashchange", openHashTarget);
  } catch (error) {
    console.error(error);
    if (datasetNavEl) {
      datasetNavEl.innerHTML = `<span class="nav-tab" aria-disabled="true">Unavailable</span>`;
    }
    if (modelAccordionEl) {
      modelAccordionEl.innerHTML = `<p>Failed to load evaluation data.</p>`;
    }
  }
}

function buildDatasetNav(data) {
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
      if (slug === modeSlug) {
        return `<a class="nav-tab nav-tab--active" href="#" aria-current="page">${escapeHtml(label)}</a>`;
      }
      const href = `${slug}-vibe-eval.html`;
      return `<a class="nav-tab" href="${encodeURI(href)}">${escapeHtml(label)}</a>`;
    })
    .join("");
}

function mapDetailsModel(model, modeData) {
  const benchmarkSlug = modeData?.benchmark?.slug || "vibe";
  const benchmark = (model.benchmarks || {})[benchmarkSlug] || {};
  const anchor = createAnchorId(model.slug);
  const generations = (model.generations || []).map((generation) => ({
    ...generation,
    mediaType: generation.mediaType || "unknown",
    mediaUrl: generation.mediaUrl || generation.mediaPath || null,
  }));
  return {
    name: model.name,
    slug: model.slug,
    anchor,
    vibe: {
      total: benchmark.total ?? 0,
      average: benchmark.average ?? 0,
      count: benchmark.count ?? 0,
    },
    generations,
    rank: 0,
  };
}

function updateBenchmarkCopy() {
  if (benchmarkHeadingEl && modePayload?.title) {
    benchmarkHeadingEl.textContent = `${modePayload.title} Benchmark Overview`;
  }
  if (leaderboardHeadingEl && modePayload?.title) {
    leaderboardHeadingEl.textContent = `${modePayload.title} Leaderboard`;
  }
  if (benchmarkSummaryEl) {
    const datasetLabel = modePayload?.label ? `${modePayload.label} Vibe Eval` : "This benchmark";
    const count = prompts.length;
    const promptWord = count === 1 ? "prompt" : "prompts";
    benchmarkSummaryEl.textContent = `${datasetLabel} sums 0-2 vibe points per prompt across ${count} ${promptWord}.`;
  }
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
      const explanationHtml = prompt.explanation
        ? `<p class="prompt-explanation">${escapeHtml(prompt.explanation)}</p>`
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
  const visibleGenerations = model.generations.filter((generation) => generation.mediaUrl);
  const grid = visibleGenerations.length
    ? `<div class="model-grid">
        ${visibleGenerations.map((generation) => renderGenerationCard(generation, model)).join("\n")}
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

function renderGenerationCard(generation, model) {
  const promptTitle = generation.prompt ? escapeHtml(generation.prompt) : "";
  const titleAttr = promptTitle ? ` title="${promptTitle}"` : "";
  const mediaHtml = renderGenerationMedia(generation, model);
  return `
    <figure class="generation-card" tabindex="0" data-model="${escapeHtml(model.slug)}" data-uid="${escapeHtml(
      generation.uid
    )}"${titleAttr}>
      ${mediaHtml}
      <figcaption class="generation-overlay">
        <span class="generation-score">Score: ${formatScore(generation.score || 0)}</span>
        <p class="generation-comment">${escapeHtml(generation.comment || "No comment provided.")}</p>
      </figcaption>
    </figure>
  `;
}

function renderGenerationMedia(generation, model) {
  const source = generation.mediaUrl;
  if (!source) {
    return `
      <div class="generation-placeholder">
        <span>${escapeHtml(model.name)}</span>
        <span>No media available</span>
      </div>
    `;
  }
  const encoded = encodeURI(source);
  if (generation.mediaType === "video") {
    return `
      <video class="generation-media" src="${encoded}" preload="metadata" muted playsinline loop autoplay>
        Sorry, your browser can't play this video.
      </video>
    `;
  }
  return `<img class="generation-media" src="${encoded}" alt="${escapeHtml(model.name)} prompt ${escapeHtml(
    generation.uid
  )}" loading="lazy" />`;
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
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

init();
