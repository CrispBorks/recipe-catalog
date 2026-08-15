/** Reads a recipe out of a web page's schema.org JSON-LD.
 *
 *  Almost every recipe site — the big ones, and any food blog running one of
 *  the WordPress recipe plugins — embeds the recipe as machine-readable JSON in
 *  a <script type="application/ld+json"> tag, because that is what Google reads
 *  to build the recipe cards in search results. Where it exists this beats any
 *  amount of text parsing: the fields are already labelled.
 *
 *  Runs in the serverless function rather than the browser, since a page can't
 *  fetch another origin's HTML. Kept free of DOM APIs and of the app's module
 *  aliases so the same file works in both places. */

import { parseIngredientLine, type ParsedRecipe } from "./parse-recipe-text.js";

/** Loose stand-in for a JSON-LD node: everything in it is optional and any
 *  field may arrive as a value, an array of values, or a nested object. */
type Node = Record<string, unknown>;

const asArray = (value: unknown): unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", deg: "°", frac12: "½", frac14: "¼", frac34: "¾",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Instruction and description fields routinely contain markup — <p>, <a>, and
 *  on some sites a whole tracking pixel. Only the words are wanted. */
const stripTags = (text: string) =>
  decodeEntities(text.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** A JSON-LD field that should be a string but might be a number, a language
 *  map, or a node with a "name". */
function asText(value: unknown): string {
  if (typeof value === "string") return stripTags(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return asText(value[0]);
  if (value && typeof value === "object") {
    const node = value as Node;
    return asText(node.name ?? node.text ?? node["@value"]);
  }
  return "";
}

const typesOf = (node: Node): string[] =>
  asArray(node["@type"]).map((t) => String(t).toLowerCase());

/** A schema.org Recipe declares itself. One lifted into an app's own state
 *  often loses "@type" on the way, but recipeIngredient is unambiguous enough
 *  to stand in for it — nothing else uses that name. */
const isRecipe = (value: unknown): value is Node => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const node = value as Node;
  if (typesOf(node).includes("recipe")) return true;
  return Array.isArray(node.recipeIngredient) && node.recipeIngredient.length > 0;
};

/** Walks a parsed JSON-LD document looking for the Recipe node. Sites nest it
 *  in every imaginable way: bare, in an array, inside "@graph", or hanging off
 *  a WebPage's "mainEntity". */
function findRecipe(value: unknown, depth = 0, maxDepth = 6): Node | null {
  if (depth > maxDepth || !value || typeof value !== "object") return null;
  if (isRecipe(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipe(item, depth + 1, maxDepth);
      if (found) return found;
    }
    return null;
  }

  // Named keys first, then everything else. JSON-LD only ever nests through
  // the named ones; an app payload nests through keys nobody can predict, so
  // past that the search has to be exhaustive.
  const node = value as Node;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "hasPart", "itemListElement"]) {
    const found = findRecipe(node[key], depth + 1, maxDepth);
    if (found) return found;
  }
  if (maxDepth > 6) {
    for (const nested of Object.values(node)) {
      const found = findRecipe(nested, depth + 1, maxDepth);
      if (found) return found;
    }
  }
  return null;
}

/** Recipe data embedded in the page as JSON, wherever it happens to sit.
 *
 *  <script type="application/ld+json"> is the standard place and is tried
 *  first. But a site built on Next or Nuxt often ships the very same
 *  schema.org object inside its hydration payload instead — same data, a
 *  different wrapper — and there's no reason to refuse to read it.
 *
 *  Bad blocks are skipped rather than fatal: one malformed script shouldn't
 *  hide a good one further down the page. */
export function findRecipeNode(html: string): Node | null {
  const scripts = [
    // Standard first: if a page publishes proper JSON-LD, that's the recipe it
    // means to publish, not whatever its app state happens to hold.
    ...html.matchAll(
      /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
    ...html.matchAll(
      /<script[^>]+type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
    // Nuxt assigns rather than declaring a JSON script.
    ...html.matchAll(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/gi),
  ];

  for (const [, body] of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripWrapper(body));
    } catch {
      continue;
    }
    // Depth is generous here: an app payload buries its data far deeper than
    // JSON-LD ever nests.
    const recipe = findRecipe(parsed, 0, 12);
    if (recipe) return recipe;
  }
  return null;
}

/** Older pages wrap inline script bodies in a CDATA section or an HTML
 *  comment, both of which are invalid JSON. */
function stripWrapper(body: string): string {
  return body
    .trim()
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .replace(/^\/\/\s*<!\[CDATA\[/, "")
    .replace(/\/\/\s*\]\]>$/, "")
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim();
}

/** ISO 8601 durations: "PT1H30M", "PT45M", occasionally "P0DT1H0M". */
export function isoDurationMinutes(value: unknown): number | null {
  const text = typeof value === "string" ? value : asText(value);
  const match = text.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)/i);
  if (!match) return null;
  const minutes =
    Number(match[1] ?? 0) * 1440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return minutes > 0 ? minutes : null;
}

/** "4", 4, "Serves 4", "4 servings", ["4 servings", "4"]. */
function servingsOf(value: unknown): string {
  for (const candidate of asArray(value)) {
    const text = asText(candidate);
    const number = text.match(/\d+/);
    if (number) return number[0];
  }
  return "";
}

/** recipeInstructions is the least consistent field in the whole schema: a
 *  single blob of text, an array of strings, an array of HowToStep nodes, or
 *  HowToSections each wrapping their own list of steps. */
function stepsOf(value: unknown): string[] {
  const steps: string[] = [];

  const visit = (item: unknown, depth = 0) => {
    if (depth > 3 || !item) return;

    if (typeof item === "string") {
      // A single string may still hold the whole method, newline-separated or
      // — on sites that flatten their markup — numbered inline.
      stripTags(item)
        .split(/\n+|(?<=[.!?])\s+(?=\d+\s*[.)]\s)/)
        .map((s) => s.replace(/^\s*\d+\s*[.)]\s*/, "").trim())
        .filter(Boolean)
        .forEach((s) => steps.push(s));
      return;
    }

    if (Array.isArray(item)) {
      item.forEach((entry) => visit(entry, depth + 1));
      return;
    }

    if (typeof item === "object") {
      const node = item as Node;
      if (node.itemListElement) {
        visit(node.itemListElement, depth + 1);
        return;
      }
      const text = asText(node.text ?? node.name);
      if (text) steps.push(text);
    }
  };

  visit(value);
  return steps;
}

/** Category, cuisine and keywords all become chips. Keywords are the noisiest
 *  of the three, so anything long or multi-word is left out. */
function tagsOf(node: Node): string[] {
  const raw = [
    ...asArray(node.recipeCategory),
    ...asArray(node.recipeCuisine),
    ...asArray(node.keywords).flatMap((k) =>
      typeof k === "string" ? k.split(",") : [k],
    ),
  ];

  const tags = raw
    .map((value) => asText(value).toLowerCase().trim())
    .filter((tag) => tag !== "" && tag.length <= 20 && tag.split(/\s+/).length <= 2);

  return [...new Set(tags)].slice(0, 8);
}

/** Some sites publish every batch size they offer — a 1× list followed by the
 *  same ingredients at 2× — in one recipeIngredient array, which arrives as
 *  eight ingredients for a four-ingredient recipe. When the back half names the
 *  same things as the front half in the same order, it's a scaled repeat and
 *  the first (unscaled) half is the one to keep.
 *
 *  Matching on names alone is what makes this safe to do: a recipe that
 *  genuinely uses flour twice won't have its whole second half line up with its
 *  first, so nothing gets dropped from a real list. */
function dropScaledRepeat(ingredients: ParsedRecipe["ingredients"]) {
  if (ingredients.length < 4 || ingredients.length % 2 !== 0) return ingredients;

  const key = (index: number) =>
    ingredients[index].name.toLowerCase().replace(/[^a-z]/g, "");

  const half = ingredients.length / 2;
  for (let i = 0; i < half; i++) {
    const front = key(i);
    if (front === "" || front !== key(i + half)) return ingredients;
  }
  return ingredients.slice(0, half);
}

export type ImportedRecipe = ParsedRecipe & {
  /** Where it came from, so the note can credit it. */
  sourceUrl: string;
  sourceName: string;
};

export function recipeFromJsonLd(node: Node, sourceUrl = ""): ImportedRecipe {
  const total =
    isoDurationMinutes(node.totalTime) ??
    (isoDurationMinutes(node.prepTime) ?? 0) + (isoDurationMinutes(node.cookTime) ?? 0);

  const ingredients = dropScaledRepeat(
    asArray(node.recipeIngredient ?? node.ingredients)
      .map(asText)
      .filter(Boolean)
      .map(parseIngredientLine),
  );

  const notes: string[] = [];
  const description = asText(node.description);
  if (description) notes.push(description);
  const yield_ = asText(node.recipeYield);
  // "Makes 24 cookies" says more than the bare number that went into servings.
  if (yield_ && !/^\d+$/.test(yield_)) notes.push(yield_);
  if (sourceUrl) notes.push(sourceUrl);

  const author = asText(node.author);

  return {
    title: asText(node.name ?? node.headline),
    time: total > 0 ? String(total) : "",
    servings: servingsOf(node.recipeYield),
    tags: tagsOf(node),
    ingredients,
    steps: stepsOf(node.recipeInstructions),
    notes,
    // The fields were labelled at the source; nothing here was guessed at.
    sectioned: true,
    sourceUrl,
    sourceName: author,
  };
}
