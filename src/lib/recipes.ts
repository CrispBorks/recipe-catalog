export type Ingredient = {
  qty: number | string;
  unit: string;
  name: string;
};

export type Recipe = {
  id: string;
  title: string;
  tags?: string[];
  time?: number;
  servings?: number;
  ingredients?: Ingredient[];
  steps?: string[];
  notes?: string[];
};

export async function fetchRecipes(): Promise<Recipe[]> {
  const res = await fetch("/data/recipes.json");
  if (!res.ok) throw new Error(`Couldn't load recipes (${res.status})`);
  return (await res.json()) as Recipe[];
}

const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];

/** Renders a quantity the way a cook would write it: whole numbers plain,
 *  near-miss fractions as glyphs, anything else to two decimals. */
export function formatQty(qty: number | string | undefined): string {
  if (typeof qty !== "number") return qty ?? "";
  if (Number.isInteger(qty)) return String(qty);

  const whole = Math.floor(qty);
  const rest = qty - whole;
  for (const [value, glyph] of FRACTIONS) {
    if (Math.abs(rest - value) < 0.02) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }
  return qty.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function scaleIngredient(ing: Ingredient, factor: number): Ingredient {
  if (factor === 1 || typeof ing.qty !== "number") return ing;
  return { ...ing, qty: ing.qty * factor };
}

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;

export function splitOnUrls(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: match[0], href: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function extractYouTubeId(text: string): string | null {
  const match = text.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
  );
  return match ? match[1] : null;
}

export function matchesQuery(recipe: Recipe, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    recipe.title,
    ...(recipe.tags ?? []),
    ...(recipe.ingredients ?? []).map((i) => i.name),
    ...(recipe.notes ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
