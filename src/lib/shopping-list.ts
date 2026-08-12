import { useSyncExternalStore } from "react";

import type { Ingredient } from "@/lib/recipes";

/** Unchanged from the vanilla build — lists saved by the old app still load. */
const STORAGE_KEY = "cardCatalog.shoppingList.v1";

export type ShoppingItem = {
  id: string;
  name: string;
  qty: number | string;
  unit: string;
  checked: boolean;
  recipe: string;
};

let items: ShoppingItem[] = read();
const listeners = new Set<() => void>();

function read(): ShoppingItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    // Lists saved before ingredients were grouped have no `recipe` field.
    return parsed.map((item: ShoppingItem) => ({
      ...item,
      recipe: item.recipe || "Other",
    }));
  } catch {
    return [];
  }
}

function commit(next: ShoppingItem[]) {
  items = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* private mode or quota — the in-memory list still works this session */
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Another tab editing the list should be reflected here too.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    items = read();
    listeners.forEach((fn) => fn());
  });
}

export function useShoppingList(): ShoppingItem[] {
  return useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  );
}

export function useShoppingCount(): number {
  return useShoppingList().length;
}

const keyOf = (recipe: string, name: string, unit: string) =>
  `${recipe.toLowerCase()}|${name.toLowerCase()}|${(unit || "").toLowerCase()}`;

export function addIngredients(ingredients: Ingredient[], recipeTitle: string) {
  const recipe = recipeTitle || "Other";
  const next = [...items];

  ingredients.forEach((ing) => {
    const key = keyOf(recipe, ing.name, ing.unit);
    const existing = next.find(
      (item) => keyOf(item.recipe, item.name, item.unit) === key,
    );
    // Same ingredient from the same recipe: add the amounts together and
    // un-check it, since there's now more to buy than was ticked off.
    if (existing && typeof existing.qty === "number" && typeof ing.qty === "number") {
      existing.qty += ing.qty;
      existing.checked = false;
    } else {
      next.push({
        id: `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: ing.name,
        qty: ing.qty,
        unit: ing.unit,
        checked: false,
        recipe,
      });
    }
  });

  commit(next);
}

export function setChecked(id: string, checked: boolean) {
  commit(items.map((item) => (item.id === id ? { ...item, checked } : item)));
}

export function removeItem(id: string) {
  commit(items.filter((item) => item.id !== id));
}

export function clearAll() {
  commit([]);
}

export function clearChecked() {
  commit(items.filter((item) => !item.checked));
}

/** Used by the undo action on the toasts that follow destructive edits. */
export function restore(snapshot: ShoppingItem[]) {
  commit(snapshot);
}

export function snapshot(): ShoppingItem[] {
  return items.map((item) => ({ ...item }));
}

export function groupByRecipe(list: ShoppingItem[]): Map<string, ShoppingItem[]> {
  const groups = new Map<string, ShoppingItem[]>();
  list.forEach((item) => {
    const key = item.recipe || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  });
  return groups;
}

/** One block per recipe. The "Recipe:" heading and "- " prefixes are what the
 *  companion iOS Shortcut parses to file one reminder per line under a list
 *  named after the recipe. Checked items are already bought, so they're left
 *  out of the export. */
export function listAsText(list: ShoppingItem[]): string {
  const blocks: string[] = [];
  groupByRecipe(list).forEach((groupItems, recipeTitle) => {
    const unchecked = groupItems.filter((item) => !item.checked);
    if (unchecked.length === 0) return;
    blocks.push(
      `${recipeTitle}:\n${unchecked.map((item) => `- ${item.name}`).join("\n")}`,
    );
  });
  return blocks.join("\n\n");
}
