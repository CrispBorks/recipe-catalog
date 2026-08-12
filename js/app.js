/* Card Catalog — vanilla JS, no build step, no dependencies. */

const STORAGE_KEY = "cardCatalog.shoppingList.v1";

const state = {
  recipes: [],
  activeTag: null,
  query: "",
};

const els = {
  grid: document.getElementById("card-grid"),
  empty: document.getElementById("empty-state"),
  resultMeta: document.getElementById("result-meta"),
  search: document.getElementById("search-input"),
  tagRow: document.getElementById("tag-filters"),
  listCount: document.getElementById("list-count"),
};

init();

async function init() {
  try {
    const res = await fetch("data/recipes.json");
    state.recipes = await res.json();
  } catch (err) {
    els.grid.innerHTML = "";
    els.empty.hidden = false;
    els.empty.textContent = "Couldn't load the recipe drawer. Check your connection and reload.";
    console.error(err);
    return;
  }

  renderTagFilters();
  renderCards();
  renderListCount();
  bindEvents();
}

/* ---------------- Recipes: search + render ---------------- */

function renderTagFilters() {
  const tags = new Set();
  state.recipes.forEach((r) => (r.tags || []).forEach((t) => tags.add(t)));
  els.tagRow.innerHTML = "";
  [...tags].sort().forEach((tag) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = tag;
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      state.activeTag = state.activeTag === tag ? null : tag;
      renderCards();
      [...els.tagRow.children].forEach((c) =>
        c.setAttribute("aria-pressed", String(c === chip && state.activeTag === tag))
      );
    });
    els.tagRow.appendChild(chip);
  });
}

function filteredRecipes() {
  const q = state.query.trim().toLowerCase();
  return state.recipes.filter((r) => {
    const matchesTag = !state.activeTag || (r.tags || []).includes(state.activeTag);
    if (!matchesTag) return false;
    if (!q) return true;
    const haystack = [
      r.title,
      ...(r.tags || []),
      ...(r.ingredients || []).map((i) => i.name),
      ...(r.notes || []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function renderCards() {
  const results = filteredRecipes();
  els.grid.innerHTML = "";
  els.empty.hidden = results.length !== 0;
  els.resultMeta.textContent = `${results.length} recipe${results.length === 1 ? "" : "s"}${
    state.activeTag ? ` · tagged "${state.activeTag}"` : ""
  }`;

  results.forEach((r) => {
    // Cards are plain links to the detail page (same tab) — a full page
    // works better than a modal on mobile.
    const card = document.createElement("a");
    card.className = "recipe-card";
    card.href = `recipe.html?id=${encodeURIComponent(r.id)}`;
    const metaParts = [];
    if (r.time) metaParts.push(`<span>${r.time} min</span>`);
    if (r.servings) metaParts.push(`<span>Serves ${r.servings}</span>`);
    card.innerHTML = `
      <p class="card-title">${escapeHtml(r.title)}</p>
      ${r.tags && r.tags.length ? `<p class="card-tags">${r.tags.slice(0, 3).join(" · ")}</p>` : ""}
      ${metaParts.length ? `<p class="card-meta">${metaParts.join("")}</p>` : ""}
    `;
    els.grid.appendChild(card);
  });
}

/* ---------------- Shopping list badge ---------------- */

// The list itself lives on shopping-list.html; here we only show how many
// items it holds, as a badge on the cart icon in the header.
function renderListCount() {
  let count = 0;
  try {
    count = (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).length;
  } catch {
    count = 0;
  }
  els.listCount.textContent = count;
  els.listCount.hidden = count === 0;
}

/* ---------------- Events ---------------- */

function bindEvents() {
  // Coming back from the recipe or shopping-list page via the back button
  // can restore this page from the bfcache without re-running init, so
  // re-read the badge — those pages may have changed the list meanwhile.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) renderListCount();
  });

  els.search.addEventListener("input", (e) => {
    state.query = e.target.value;
    renderCards();
  });
}

/* ---------------- Helpers ---------------- */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
