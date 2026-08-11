/* Card Catalog — recipe builder. Turns a form into a valid recipes.json entry. */

const KNOWN_TAGS = [
  "breakfast", "lunch", "dinner", "snack", "baking", "beef", "poultry",
  "seafood", "pasta", "vegetarian", "vegan", "gluten-free", "quick",
  "meal-prep", "roast", "kids",
];

const state = {
  tags: new Set(),
  existingRecipes: [],
};

const els = {
  form: document.getElementById("recipe-form"),
  title: document.getElementById("f-title"),
  id: document.getElementById("f-id"),
  time: document.getElementById("f-time"),
  servings: document.getElementById("f-servings"),
  tagPicker: document.getElementById("tag-picker"),
  newTag: document.getElementById("f-new-tag"),
  ingredientRows: document.getElementById("ingredient-rows"),
  stepRows: document.getElementById("step-rows"),
  addIngredient: document.getElementById("add-ingredient"),
  addStep: document.getElementById("add-step"),
  resetForm: document.getElementById("reset-form"),
  formError: document.getElementById("form-error"),
  outputPanel: document.getElementById("output-panel"),
  outputHint: document.getElementById("output-hint"),
  outputJson: document.getElementById("output-json"),
  copyJson: document.getElementById("copy-json"),
  downloadFull: document.getElementById("download-full"),
  toast: document.getElementById("toast"),
};

let latestRecipe = null;
let idTouchedManually = false;

init();

async function init() {
  renderTagPicker();
  addIngredientRow();
  addIngredientRow();
  addStepRow();
  addStepRow();
  bindEvents();

  try {
    const res = await fetch("data/recipes.json");
    state.existingRecipes = await res.json();
  } catch {
    state.existingRecipes = [];
  }
}

function renderTagPicker() {
  els.tagPicker.innerHTML = "";
  const allTags = [...new Set([...KNOWN_TAGS, ...state.tags])].sort();
  allTags.forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-chip" + (state.tags.has(tag) ? " selected" : "");
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      if (state.tags.has(tag)) state.tags.delete(tag);
      else state.tags.add(tag);
      renderTagPicker();
    });
    els.tagPicker.appendChild(chip);
  });
}

function addIngredientRow(values) {
  const row = document.createElement("div");
  row.className = "repeat-row";
  row.innerHTML = `
    <div class="field qty-field">
      <label>Qty</label>
      <input type="text" class="ing-qty" placeholder="2" inputmode="decimal" />
    </div>
    <div class="field unit-field">
      <label>Unit</label>
      <input type="text" class="ing-unit" placeholder="tbsp" />
    </div>
    <div class="field name-field">
      <label>Ingredient</label>
      <input type="text" class="ing-name" placeholder="olive oil" />
    </div>
    <button type="button" class="remove-row-btn" aria-label="Remove ingredient">×</button>
  `;
  if (values) {
    row.querySelector(".ing-qty").value = values.qty ?? "";
    row.querySelector(".ing-unit").value = values.unit ?? "";
    row.querySelector(".ing-name").value = values.name ?? "";
  }
  row.querySelector(".remove-row-btn").addEventListener("click", () => {
    if (els.ingredientRows.children.length > 1) row.remove();
  });
  els.ingredientRows.appendChild(row);
}

function addStepRow(value) {
  const row = document.createElement("div");
  row.className = "repeat-row";
  const index = els.stepRows.children.length + 1;
  row.innerHTML = `
    <div class="step-number">${index}</div>
    <div class="field step-field">
      <label class="sr-only">Step ${index}</label>
      <textarea class="step-text" placeholder="Heat oven to 425°F..." rows="2"></textarea>
    </div>
    <button type="button" class="remove-row-btn" aria-label="Remove step">×</button>
  `;
  if (value) row.querySelector(".step-text").value = value;
  row.querySelector(".remove-row-btn").addEventListener("click", () => {
    if (els.stepRows.children.length > 1) {
      row.remove();
      renumberSteps();
    }
  });
  els.stepRows.appendChild(row);
}

function renumberSteps() {
  [...els.stepRows.children].forEach((row, i) => {
    row.querySelector(".step-number").textContent = i + 1;
  });
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function bindEvents() {
  els.title.addEventListener("input", () => {
    if (!idTouchedManually) els.id.value = slugify(els.title.value);
  });

  els.id.addEventListener("input", () => {
    idTouchedManually = true;
  });

  els.newTag.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const value = els.newTag.value.trim().toLowerCase();
    if (!value) return;
    state.tags.add(value);
    els.newTag.value = "";
    renderTagPicker();
  });

  els.addIngredient.addEventListener("click", () => addIngredientRow());
  els.addStep.addEventListener("click", () => addStepRow());

  els.resetForm.addEventListener("click", () => {
    if (!confirm("Clear everything in this form?")) return;
    els.form.reset();
    state.tags.clear();
    idTouchedManually = false;
    els.ingredientRows.innerHTML = "";
    els.stepRows.innerHTML = "";
    addIngredientRow();
    addIngredientRow();
    addStepRow();
    addStepRow();
    renderTagPicker();
    els.outputPanel.hidden = true;
    hideError();
  });

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    handleGenerate();
  });

  els.copyJson.addEventListener("click", async () => {
    if (!latestRecipe) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(latestRecipe, null, 2));
      showToast("Recipe JSON copied");
    } catch {
      showToast("Couldn't copy — select the text manually");
    }
  });

  els.downloadFull.addEventListener("click", () => {
    if (!latestRecipe) return;
    const updated = [...state.existingRecipes, latestRecipe];
    const blob = new Blob([JSON.stringify(updated, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recipes.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Downloaded updated recipes.json");
  });
}

function showError(message) {
  els.formError.textContent = message;
  els.formError.hidden = false;
}

function hideError() {
  els.formError.hidden = true;
}

function handleGenerate() {
  hideError();

  const title = els.title.value.trim();
  const id = els.id.value.trim();
  const time = Number(els.time.value);
  const servings = Number(els.servings.value);

  if (!title) return showError("Give the recipe a title.");
  if (!id) return showError("The ID field is empty — retype the title or fill it in manually.");
  if (!time || time <= 0) return showError("Enter a time in minutes.");
  if (!servings || servings <= 0) return showError("Enter a number of servings.");

  const duplicate = state.existingRecipes.find((r) => r.id === id);
  if (duplicate) {
    return showError(`A recipe with the ID "${id}" already exists ("${duplicate.title}"). Change the title or edit the ID field.`);
  }

  const ingredientRows = [...els.ingredientRows.children];
  const ingredients = ingredientRows
    .map((row) => {
      const name = row.querySelector(".ing-name").value.trim();
      if (!name) return null;
      const qtyRaw = row.querySelector(".ing-qty").value.trim();
      const unit = row.querySelector(".ing-unit").value.trim();
      const qty = qtyRaw === "" ? "" : (Number.isFinite(Number(qtyRaw)) ? Number(qtyRaw) : qtyRaw);
      return { qty, unit, name };
    })
    .filter(Boolean);

  if (ingredients.length === 0) return showError("Add at least one ingredient.");

  const stepRows = [...els.stepRows.children];
  const steps = stepRows
    .map((row) => row.querySelector(".step-text").value.trim())
    .filter(Boolean);

  if (steps.length === 0) return showError("Add at least one step.");

  latestRecipe = {
    id,
    title,
    tags: [...state.tags],
    time,
    servings,
    ingredients,
    steps,
  };

  els.outputJson.textContent = JSON.stringify(latestRecipe, null, 2);
  els.outputHint.textContent = state.existingRecipes.length
    ? `Loaded ${state.existingRecipes.length} existing recipe(s) — the download button below bundles this one in with all of them.`
    : `Couldn't load the current recipes.json (fine if you're offline) — the download button will just include this one recipe.`;
  els.outputPanel.hidden = false;
  els.outputPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}
