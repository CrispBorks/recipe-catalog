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
  dialog: document.getElementById("recipe-detail"),
  detailTitle: document.getElementById("detail-title"),
  detailMeta: document.getElementById("detail-meta"),
  detailIngredients: document.getElementById("detail-ingredients"),
  detailSteps: document.getElementById("detail-steps"),
  detailClose: document.getElementById("detail-close"),
  addSelectedBtn: document.getElementById("add-selected-btn"),
  addAllBtn: document.getElementById("add-all-btn"),
  toast: document.getElementById("toast"),
};

let activeRecipe = null;

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
  state.recipes.forEach((r) => r.tags.forEach((t) => tags.add(t)));
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
    const matchesTag = !state.activeTag || r.tags.includes(state.activeTag);
    if (!matchesTag) return false;
    if (!q) return true;
    const haystack = [
      r.title,
      ...r.tags,
      ...r.ingredients.map((i) => i.name),
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
    const card = document.createElement("button");
    card.className = "recipe-card";
    card.innerHTML = `
      <p class="card-title">${escapeHtml(r.title)}</p>
      <p class="card-tags">${r.tags.slice(0, 3).join(" · ")}</p>
      <p class="card-meta"><span>${r.time} min</span><span>Serves ${r.servings}</span></p>
    `;
    card.addEventListener("click", () => openDetail(r));
    els.grid.appendChild(card);
  });
}

/* ---------------- Recipe detail dialog ---------------- */

function openDetail(recipe) {
  activeRecipe = recipe;
  els.detailTitle.textContent = recipe.title;
  els.detailMeta.textContent = `${recipe.time} min · Serves ${recipe.servings} · ${recipe.tags.join(", ")}`;

  els.detailIngredients.innerHTML = "";
  recipe.ingredients.forEach((ing, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <input type="checkbox" id="ing-${idx}" checked />
      <span class="qty">${formatQty(ing.qty)} ${ing.unit}</span>
      <label for="ing-${idx}">${escapeHtml(ing.name)}</label>
    `;
    els.detailIngredients.appendChild(li);
  });

  els.detailSteps.innerHTML = "";
  recipe.steps.forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step;
    els.detailSteps.appendChild(li);
  });

  els.dialog.showModal();
}

/* ---------------- Shopping list ---------------- */

function loadList() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveList() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.list));
}

function addIngredientsToList(ingredients) {
  ingredients.forEach((ing) => {
    const key = `${ing.name.toLowerCase()}|${(ing.unit || "").toLowerCase()}`;
    const existing = state.list.find(
      (item) => `${item.name.toLowerCase()}|${(item.unit || "").toLowerCase()}` === key
    );
    if (existing && typeof existing.qty === "number" && typeof ing.qty === "number") {
      existing.qty += ing.qty;
      existing.checked = false;
    } else {
      state.list.push({
        id: `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: ing.name,
        qty: ing.qty,
        unit: ing.unit,
        checked: false,
      });
    }
  });
  saveList();
  renderShoppingList();
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

  state.list.forEach((item) => {
    const li = document.createElement("li");
    li.className = item.checked ? "checked" : "";
    li.innerHTML = `
      <input type="checkbox" ${item.checked ? "checked" : ""} aria-label="Mark ${escapeHtml(item.name)} purchased" />
      <span class="qty">${formatQty(item.qty)} ${item.unit || ""}</span>
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
}

function listAsText() {
  return state.list
    .map((item) => `${formatQty(item.qty)} ${item.unit || ""} ${item.name}`.replace(/\s+/g, " ").trim())
    .join("\n");
}

/* ---------------- Events ---------------- */

function bindEvents() {
  els.search.addEventListener("input", (e) => {
    state.query = e.target.value;
    renderCards();
  });

  els.tabRecipes.addEventListener("click", () => switchTab("recipes"));
  els.tabList.addEventListener("click", () => switchTab("list"));

  els.detailClose.addEventListener("click", () => els.dialog.close());
  els.dialog.addEventListener("click", (e) => {
    if (e.target === els.dialog) els.dialog.close();
  });

  els.addAllBtn.addEventListener("click", () => {
    addIngredientsToList(activeRecipe.ingredients);
    showToast(`Added all ingredients from ${activeRecipe.title}`);
    els.dialog.close();
  });

  els.addSelectedBtn.addEventListener("click", () => {
    const checked = [...els.detailIngredients.querySelectorAll('input[type="checkbox"]:checked')];
    const idxs = checked.map((c) => Number(c.id.replace("ing-", "")));
    const chosen = idxs.map((i) => activeRecipe.ingredients[i]);
    if (chosen.length === 0) {
      showToast("Select at least one ingredient first");
      return;
    }
    addIngredientsToList(chosen);
    showToast(`Added ${chosen.length} ingredient${chosen.length === 1 ? "" : "s"} to your list`);
    els.dialog.close();
  });

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

function formatQty(qty) {
  if (typeof qty !== "number") return qty || "";
  if (Number.isInteger(qty)) return String(qty);
  return qty.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

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
