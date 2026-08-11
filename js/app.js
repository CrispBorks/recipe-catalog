/* Card Catalog — vanilla JS, no build step, no dependencies. */

const STORAGE_KEY = "cardCatalog.shoppingList.v1";

const state = {
  recipes: [],
  activeTag: null,
  query: "",
  list: loadList(),
};

const els = {
  grid: document.getElementById("card-grid"),
  empty: document.getElementById("empty-state"),
  resultMeta: document.getElementById("result-meta"),
  search: document.getElementById("search-input"),
  tagRow: document.getElementById("tag-filters"),
  tabRecipes: document.getElementById("tab-recipes"),
  tabList: document.getElementById("tab-list"),
  viewRecipes: document.getElementById("view-recipes"),
  viewList: document.getElementById("view-list"),
  listCount: document.getElementById("list-count"),
  shoppingItems: document.getElementById("shopping-items"),
  listEmpty: document.getElementById("list-empty-state"),
  clearListBtn: document.getElementById("clear-list-btn"),
  clearCheckedBtn: document.getElementById("clear-checked-btn"),
  shareBtn: document.getElementById("share-reminders-btn"),
  copyBtn: document.getElementById("copy-list-btn"),
  toast: document.getElementById("toast"),
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
  renderShoppingList();
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

/* ---------------- Shopping list ---------------- */

function loadList() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    // Older saved lists (pre-grouping) won't have a `recipe` field yet —
    // give those items a fallback section so they still render/export fine.
    return list.map((item) => ({ ...item, recipe: item.recipe || "Other" }));
  } catch {
    return [];
  }
}

function saveList() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.list));
}

// Groups the flat list into ordered sections keyed by recipe name, preserving
// the order in which each recipe was first added to the list.
function groupByRecipe() {
  const groups = new Map();
  state.list.forEach((item) => {
    const key = item.recipe || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

function renderShoppingList() {
  els.listCount.textContent = state.list.length;
  els.shoppingItems.innerHTML = "";
  els.listEmpty.hidden = state.list.length !== 0;

  const disable = state.list.length === 0;
  els.shareBtn.disabled = disable;
  els.copyBtn.disabled = disable;
  els.clearListBtn.disabled = disable;
  els.clearCheckedBtn.disabled = disable;

  const groups = groupByRecipe();

  groups.forEach((items, recipeTitle) => {
    const header = document.createElement("li");
    header.className = "list-section-header";
    header.textContent = recipeTitle;
    els.shoppingItems.appendChild(header);

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = item.checked ? "checked" : "";
      li.innerHTML = `
        <input type="checkbox" ${item.checked ? "checked" : ""} aria-label="Mark ${escapeHtml(item.name)} purchased" />
        <span class="item-name">${escapeHtml(item.name)}</span>
        <button class="remove-item" aria-label="Remove ${escapeHtml(item.name)}">×</button>
      `;
      li.querySelector('input[type="checkbox"]').addEventListener("change", (e) => {
        item.checked = e.target.checked;
        saveList();
        renderShoppingList();
      });
      li.querySelector(".remove-item").addEventListener("click", () => {
        state.list = state.list.filter((i) => i.id !== item.id);
        saveList();
        renderShoppingList();
      });
      els.shoppingItems.appendChild(li);
    });
  });
}

// Produces one block per recipe, e.g.:
//   Chicken Alfredo:
//   - pasta
//   - chicken breast
//
//   Beef Tacos:
//   - ground beef
// The "Recipe:" header + "- " item prefix are intentional — they're what the
// companion Shortcut parses to create one reminder per line, filed under a
// list named after the recipe, instead of dumping the whole list into a
// single Reminder. Checked-off items are already purchased, so they're left
// out of the export — no point re-adding something you've already got.
function listAsText() {
  const groups = groupByRecipe();
  const blocks = [];
  groups.forEach((items, recipeTitle) => {
    const unchecked = items.filter((item) => !item.checked);
    if (unchecked.length === 0) return;
    const lines = unchecked.map((item) => `- ${item.name}`);
    blocks.push(`${recipeTitle}:\n${lines.join("\n")}`);
  });
  return blocks.join("\n\n");
}

/* ---------------- Events ---------------- */

function bindEvents() {
  // Coming back from the recipe page via the back button can restore this
  // page from the bfcache without re-running init, so re-read the shopping
  // list — the recipe page may have added items to it in the meantime.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      state.list = loadList();
      renderShoppingList();
    }
  });

  els.search.addEventListener("input", (e) => {
    state.query = e.target.value;
    renderCards();
  });

  els.tabRecipes.addEventListener("click", () => switchTab("recipes"));
  els.tabList.addEventListener("click", () => switchTab("list"));

  els.clearListBtn.addEventListener("click", () => {
    if (state.list.length && !confirm("Clear the entire shopping list?")) return;
    state.list = [];
    saveList();
    renderShoppingList();
  });

  els.clearCheckedBtn.addEventListener("click", () => {
    state.list = state.list.filter((i) => !i.checked);
    saveList();
    renderShoppingList();
  });

  els.copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(listAsText());
      showToast("List copied to clipboard");
    } catch {
      showToast("Couldn't copy — select and copy manually");
    }
  });

  els.shareBtn.addEventListener("click", async () => {
    const text = listAsText();
    if (navigator.share) {
      try {
        await navigator.share({ title: "Shopping List", text });
      } catch {
        /* user cancelled the share sheet — no action needed */
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Sharing isn't supported here — list copied instead");
      } catch {
        showToast("Copy the list manually from the panel");
      }
    }
  });
}

function switchTab(which) {
  const onRecipes = which === "recipes";
  els.viewRecipes.hidden = !onRecipes;
  els.viewList.hidden = onRecipes;
  els.tabRecipes.setAttribute("aria-current", String(onRecipes));
  els.tabList.setAttribute("aria-current", String(!onRecipes));
}

/* ---------------- Helpers ---------------- */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}
