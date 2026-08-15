import { describe, expect, it } from "vitest";

import { recipeFromMicrodata } from "../src/lib/recipe-microdata";
import { findRecipeNode } from "../src/lib/recipe-jsonld";

const PAGE = `<html><body>
  <article itemscope itemtype="https://schema.org/Recipe">
    <h1 itemprop="name">Mutton Kosha</h1>
    <span itemprop="author">Bong Eats</span>
    <p itemprop="description">Slow-cooked Bengali mutton curry.</p>
    <meta itemprop="prepTime" content="PT30M">
    <meta itemprop="cookTime" content="PT1H30M">
    <span itemprop="recipeYield">Serves 6</span>
    <span itemprop="recipeCuisine">Bengali</span>
    <ul>
      <li itemprop="recipeIngredient">1 kg mutton, curry cut</li>
      <li itemprop="recipeIngredient">2 tbsp mustard oil</li>
      <li itemprop="recipeIngredient">3 onions, sliced</li>
    </ul>
    <div itemprop="recipeInstructions">
      <p>1. Marinate the mutton for two hours.</p>
      <p>2. Fry the onions until deep brown.</p>
      <p>3. Cook covered on low heat for an hour.</p>
    </div>
    <div itemprop="review" itemscope itemtype="https://schema.org/Review">
      <span itemprop="name">Best I've made</span>
      <span itemprop="author">Someone Else</span>
    </div>
  </article>
</body></html>`;

describe("recipeFromMicrodata", () => {
  const recipe = recipeFromMicrodata(PAGE, "https://example.com/mutton-kosha")!;

  it("finds the recipe", () => {
    expect(recipe).not.toBeNull();
    expect(recipe.title).toBe("Mutton Kosha");
  });

  it("reads times from attributes, not the text beside them", () => {
    expect(recipe.time).toBe("120"); // 30 prep + 90 cook
  });

  it("reads the yield", () => {
    expect(recipe.servings).toBe("6");
  });

  it("parses the ingredients", () => {
    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.ingredients[1]).toEqual({ qty: "2", unit: "tbsp", name: "mustard oil" });
  });

  it("splits one instructions block into steps and strips their numbering", () => {
    expect(recipe.steps).toHaveLength(3);
    expect(recipe.steps[0]).toBe("Marinate the mutton for two hours.");
  });

  /** A review has its own name and author. Taking the nearest ones would
   *  retitle the recipe "Best I've made" by "Someone Else". */
  it("ignores props belonging to a nested scope", () => {
    expect(recipe.title).not.toBe("Best I've made");
    expect(recipe.sourceName).toBe("Bong Eats");
  });

  it("keeps the description and source link as notes", () => {
    expect(recipe.notes).toContain("Slow-cooked Bengali mutton curry.");
    expect(recipe.notes).toContain("https://example.com/mutton-kosha");
  });

  it("returns null when there's no recipe", () => {
    expect(recipeFromMicrodata("<html><body>hi</body></html>")).toBeNull();
    expect(
      recipeFromMicrodata('<div itemscope itemtype="https://schema.org/Article"></div>'),
    ).toBeNull();
  });

  it("returns null for a scope with neither ingredients nor steps", () => {
    expect(
      recipeFromMicrodata(
        '<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Empty</h1></div>',
      ),
    ).toBeNull();
  });

  it("takes separate instruction props as separate steps", () => {
    const recipe = recipeFromMicrodata(`<div itemscope itemtype="http://schema.org/Recipe">
      <li itemprop="recipeIngredient">1 egg</li>
      <li itemprop="recipeInstructions">Beat it.</li>
      <li itemprop="recipeInstructions">Cook it.</li>
    </div>`)!;
    expect(recipe.steps).toEqual(["Beat it.", "Cook it."]);
  });
});

/** Sites that build themselves in the browser often still ship the recipe in
 *  the page, just not as JSON-LD. */
describe("recipe data outside a ld+json block", () => {
  it("finds a schema.org Recipe inside a Next.js payload", () => {
    const html = `<html><body><div id="__next"></div>
      <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"page":{"content":{"recipe":
        {"@type":"Recipe","name":"Mutton Kosha","recipeIngredient":["1 kg mutton"],
         "recipeInstructions":"Cook it slowly."}}}}},"page":"/recipe/[slug]"}
      </script></body></html>`;
    expect(findRecipeNode(html)?.name).toBe("Mutton Kosha");
  });

  it("recognises a recipe that lost its @type on the way into app state", () => {
    const html = `<script type="application/json">
      {"data":{"entry":{"title":"X","recipeIngredient":["2 eggs"]}}}</script>`;
    expect(findRecipeNode(html)).not.toBeNull();
  });

  it("prefers a real JSON-LD block over an app payload", () => {
    const html = `<script type="application/json">
        {"recipe":{"@type":"Recipe","name":"From app state","recipeIngredient":["x"]}}</script>
      <script type="application/ld+json">
        {"@type":"Recipe","name":"From JSON-LD","recipeIngredient":["y"]}</script>`;
    expect(findRecipeNode(html)?.name).toBe("From JSON-LD");
  });

  it("reads a block wrapped in CDATA", () => {
    const html = `<script type="application/ld+json">//<![CDATA[
      {"@type":"Recipe","name":"Wrapped","recipeIngredient":["z"]}
    //]]></script>`;
    expect(findRecipeNode(html)?.name).toBe("Wrapped");
  });

  it("still returns null when the page holds no recipe at all", () => {
    expect(findRecipeNode('<script type="application/json">{"a":{"b":1}}</script>')).toBeNull();
  });
});
