/* Card Catalog — recipe detail page. Reads ?id= from the URL and renders
   that recipe full-page. Shares the shopping list with the catalog via the
   same localStorage key, so "add to list" here shows up on the main page. */

const STORAGE_KEY = "cardCatalog.shoppingList.v1";

const els = {
  page: document.querySelector(".detail-page .detail-inner"),
  missing: document.getElementById("detail-missing"),
  title: document.getElementById("detail-title"),
  meta: document.getElementById("detail-meta"),
  ingredients: document.getElementById("detail-ingredients"),
  ingredientsSection: document.getElementById("detail-ingredients-section"),
  steps: document.getElementById("detail-steps"),
  stepsSection: document.getElementById("detail-steps-section"),
  notesSection: document.getElementById("detail-notes-section"),
  notes: document.getElementById("detail-notes"),
  actions: document.getElementById("detail-actions"),
  addSelectedBtn: document.getElementById("add-selected-btn"),
  addAllBtn: document.getElementById("add-all-btn"),
  toast: document.getElementById("toast"),
};

let recipe = null;

init();

async function init() {
  const id = new URLSearchParams(location.search).get("id");

  let recipes = [];
  try {
    const res = await fetch("data/recipes.json");
    recipes = await res.json();
  } catch (err) {
    console.error(err);
  }

  recipe = recipes.find((r) => r.id === id) || null;
  if (!recipe) {
    els.page.hidden = true;
    els.missing.hidden = false;
    return;
  }

  render();
  bindEvents();
}

function render() {
  document.title = `${recipe.title} — Card Catalog`;
  els.title.textContent = recipe.title;

  const metaParts = [];
  if (recipe.time) metaParts.push(`${recipe.time} min`);
  if (recipe.servings) metaParts.push(`Serves ${recipe.servings}`);
  if (recipe.tags && recipe.tags.length) metaParts.push(recipe.tags.join(", "));
  els.meta.textContent = metaParts.join(" · ");
  els.meta.hidden = metaParts.length === 0;

  const hasIngredients = recipe.ingredients && recipe.ingredients.length > 0;
  els.ingredientsSection.hidden = !hasIngredients;
  els.ingredients.innerHTML = "";
  if (hasIngredients) {
    recipe.ingredients.forEach((ing, idx) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <input type="checkbox" id="ing-${idx}" checked />
        <span class="qty">${formatQty(ing.qty)} ${ing.unit}</span>
        <label for="ing-${idx}">${escapeHtml(ing.name)}</label>
      `;
      els.ingredients.appendChild(li);
    });
  }

  const hasSteps = recipe.steps && recipe.steps.length > 0;
  els.stepsSection.hidden = !hasSteps;
  els.steps.innerHTML = "";
  if (hasSteps) {
    recipe.steps.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      els.steps.appendChild(li);
    });
  }

  // No ingredients means there's nothing for these buttons to add — hide
  // the whole action row rather than show buttons that do nothing.
  els.actions.hidden = !hasIngredients;

  renderNotes(recipe.notes || []);
}

// Renders each note as text with any URLs turned into links. If a note
// contains a YouTube link, that link is also dropped in as an embedded
// player right below the text, instead of just being a plain link.
function renderNotes(notes) {
  els.notes.innerHTML = "";
  els.notesSection.hidden = notes.length === 0;

  notes.forEach((note) => {
    const li = document.createElement("li");
    li.innerHTML = linkifyText(note);

    const videoId = extractYouTubeId(note);
    if (videoId) {
      const wrap = document.createElement("div");
      wrap.className = "note-embed";
      wrap.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video" frameborder="0" allowfullscreen loading="lazy"></iframe>`;
      li.appendChild(wrap);
    }

    els.notes.appendChild(li);
  });
}

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;

function linkifyText(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(URL_PATTERN, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

function extractYouTubeId(text) {
  const match = text.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return match ? match[1] : null;
}

/* ---------------- Shopping list (shared with index) ---------------- */

function loadList() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return list.map((item) => ({ ...item, recipe: item.recipe || "Other" }));
  } catch {
    return [];
  }
}

function addIngredientsToList(ingredients, recipeTitle) {
  const list = loadList();
  const recipeName = recipeTitle || "Other";
  ingredients.forEach((ing) => {
    const key = `${recipeName.toLowerCase()}|${ing.name.toLowerCase()}|${(ing.unit || "").toLowerCase()}`;
    const existing = list.find(
      (item) =>
        `${item.recipe.toLowerCase()}|${item.name.toLowerCase()}|${(item.unit || "").toLowerCase()}` === key
    );
    if (existing && typeof existing.qty === "number" && typeof ing.qty === "number") {
      existing.qty += ing.qty;
      existing.checked = false;
    } else {
      list.push({
        id: `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: ing.name,
        qty: ing.qty,
        unit: ing.unit,
        checked: false,
        recipe: recipeName,
      });
    }
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/* ---------------- Events ---------------- */

function bindEvents() {
  els.addAllBtn.addEventListener("click", () => {
    addIngredientsToList(recipe.ingredients, recipe.title);
    showToast(`Added all ingredients from ${recipe.title}`);
  });

  els.addSelectedBtn.addEventListener("click", () => {
    const checked = [...els.ingredients.querySelectorAll('input[type="checkbox"]:checked')];
    const idxs = checked.map((c) => Number(c.id.replace("ing-", "")));
    const chosen = idxs.map((i) => recipe.ingredients[i]);
    if (chosen.length === 0) {
      showToast("Select at least one ingredient first");
      return;
    }
    addIngredientsToList(chosen, recipe.title);
    showToast(`Added ${chosen.length} ingredient${chosen.length === 1 ? "" : "s"} to your list`);
  });
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
