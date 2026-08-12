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

const GLYPHS: Record<string, string> = {
  "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾",
  "1/5": "⅕", "2/5": "⅖", "3/5": "⅗", "4/5": "⅘",
  "1/6": "⅙", "5/6": "⅚",
  "1/8": "⅛", "3/8": "⅜", "5/8": "⅝", "7/8": "⅞",
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Closest fraction with a denominator a cook would recognise. Smaller
 *  denominators win ties, so 0.5 comes back as 1/2 rather than 8/16. */
function bestFraction(value: number, maxDenominator = 16) {
  let best: { n: number; d: number } | null = null;
  let bestError = Infinity;

  for (let d = 2; d <= maxDenominator; d++) {
    const n = Math.round(value * d);
    if (n <= 0) continue;
    const error = Math.abs(value - n / d);
    if (error < bestError - 1e-9) {
      bestError = error;
      const divisor = gcd(n, d);
      best = { n: n / divisor, d: d / divisor };
    }
  }
  return best && bestError <= 0.02 ? best : null;
}

/** Renders a quantity the way a cook would write it. Scaling a 12-serving
 *  recipe down to 1 gives amounts like 0.0833 cup, which is unreadable in a
 *  kitchen — as a fraction that's 1/12 cup, which isn't. */
export function formatQty(qty: number | string | undefined): string {
  if (typeof qty !== "number") return qty ?? "";
  if (Number.isInteger(qty)) return String(qty);

  const whole = Math.floor(qty);
  const fraction = bestFraction(qty - whole);

  if (fraction) {
    const key = `${fraction.n}/${fraction.d}`;
    const glyph = GLYPHS[key];
    if (whole === 0) return glyph ?? key;
    // Glyphs sit tight against the whole number (1½); "1 5/12" needs the space.
    return glyph ? `${whole}${glyph}` : `${whole} ${key}`;
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
