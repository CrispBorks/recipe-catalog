/* Card Catalog — shopping list page. Renders the list stored in
   localStorage (shared with the catalog and recipe pages), with the same
   check/remove/clear/copy/share behavior the old in-page tab had. */

const STORAGE_KEY = "cardCatalog.shoppingList.v1";

const state = {
  list: loadList(),
};

const els = {
  shoppingItems: document.getElementById("shopping-items"),
  listEmpty: document.getElementById("list-empty-state"),
  clearListBtn: document.getElementById("clear-list-btn"),
  clearCheckedBtn: document.getElementById("clear-checked-btn"),
  shareBtn: document.getElementById("share-reminders-btn"),
  copyBtn: document.getElementById("copy-list-btn"),
  toast: document.getElementById("toast"),
};

renderShoppingList();
bindEvents();

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

function bindEvents() {
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
