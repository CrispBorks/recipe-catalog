/** Reads a recipe out of schema.org microdata — the older markup, where the
 *  fields are attributes on the page's own elements rather than a block of JSON:
 *
 *      <div itemscope itemtype="https://schema.org/Recipe">
 *        <h1 itemprop="name">Mutton Kosha</h1>
 *        <li itemprop="recipeIngredient">1 kg mutton</li>
 *
 *  Tried only after JSON-LD, which is both more common and less ambiguous. A
 *  site publishing both means the same thing twice, and the JSON says it more
 *  precisely.
 *
 *  This one needs a real parser rather than regexes: the fields are scoped by
 *  nesting, so knowing which itemprops belong to the recipe — rather than to a
 *  review, a video, or a second recipe further down — means knowing the tree. */

import { parse, type HTMLElement } from "node-html-parser";

import { parseIngredientLine, type ParsedRecipe } from "./parse-recipe-text.js";
import { isoDurationMinutes, type ImportedRecipe } from "./recipe-jsonld.js";

/** A time is published as an attribute rather than as text — <meta content>
 *  or <time datetime> — because the text beside it says "30 mins", not "PT30M". */
const valueOf = (el: HTMLElement): string =>
  (el.getAttribute("content") ?? el.getAttribute("datetime") ?? el.text ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** Nested itemscopes have their own props: a review's "name" is the reviewer,
 *  not the recipe. Only props belonging to this scope count. */
function propsOf(scope: HTMLElement, name: string): HTMLElement[] {
  return scope
    .querySelectorAll(`[itemprop~="${name}"]`)
    .filter((el) => nearestScope(el, scope) === scope);
}

function nearestScope(el: HTMLElement, root: HTMLElement): HTMLElement | null {
  let parent = el.parentNode;
  while (parent && parent !== root.parentNode) {
    if (parent.hasAttribute?.("itemscope")) return parent;
    parent = parent.parentNode;
  }
  return null;
}

const firstText = (scope: HTMLElement, name: string): string => {
  const [el] = propsOf(scope, name);
  return el ? valueOf(el) : "";
};

const minutes = (scope: HTMLElement, name: string): number | null => {
  const [el] = propsOf(scope, name);
  return el ? isoDurationMinutes(valueOf(el)) : null;
};

/** One long instructions block is as common as a list of them, and arrives as
 *  paragraphs or list items rather than as separate itemprops. */
function stepsIn(scope: HTMLElement): string[] {
  const holders = propsOf(scope, "recipeInstructions");
  if (holders.length === 0) return [];

  if (holders.length > 1) {
    return holders.map(valueOf).filter(Boolean);
  }

  const [holder] = holders;
  const parts = holder.querySelectorAll("li, p");
  const steps = (parts.length > 0 ? parts.map(valueOf) : valueOf(holder).split(/\n+/))
    .map((step) => step.replace(/^\s*\d+\s*[.)]\s*/, "").trim())
    .filter(Boolean);

  return steps.length > 0 ? steps : [valueOf(holder)].filter(Boolean);
}

export function recipeFromMicrodata(html: string, sourceUrl = ""): ImportedRecipe | null {
  let root: HTMLElement;
  try {
    root = parse(html);
  } catch {
    return null;
  }

  const scope = root
    .querySelectorAll("[itemscope][itemtype]")
    .find((el) => /schema\.org\/recipe$/i.test(el.getAttribute("itemtype") ?? ""));
  if (!scope) return null;

  const ingredients = [...propsOf(scope, "recipeIngredient"), ...propsOf(scope, "ingredients")]
    .map(valueOf)
    .filter(Boolean)
    .map(parseIngredientLine);

  const steps = stepsIn(scope);
  if (ingredients.length === 0 && steps.length === 0) return null;

  const total =
    minutes(scope, "totalTime") ??
    (minutes(scope, "prepTime") ?? 0) + (minutes(scope, "cookTime") ?? 0);

  const notes: string[] = [];
  const description = firstText(scope, "description");
  if (description) notes.push(description);
  if (sourceUrl) notes.push(sourceUrl);

  const yield_ = firstText(scope, "recipeYield");

  const tags = [firstText(scope, "recipeCategory"), firstText(scope, "recipeCuisine")]
    .map((tag) => tag.toLowerCase().trim())
    .filter((tag) => tag !== "" && tag.length <= 20 && tag.split(/\s+/).length <= 2);

  const parsed: ParsedRecipe = {
    title: firstText(scope, "name") || firstText(scope, "headline"),
    time: total > 0 ? String(total) : "",
    servings: yield_.match(/\d+/)?.[0] ?? "",
    tags: [...new Set(tags)],
    ingredients,
    steps,
    notes,
    // The fields were labelled at the source; nothing here was guessed at.
    sectioned: true,
  };

  return { ...parsed, sourceUrl, sourceName: firstText(scope, "author") };
}
