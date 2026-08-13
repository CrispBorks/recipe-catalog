import { describe, expect, it } from "vitest";

import {
  findRecipeNode,
  isoDurationMinutes,
  recipeFromJsonLd,
} from "../src/lib/recipe-jsonld";

const wrap = (json: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head></html>`;

const read = (json: unknown, url?: string) => {
  const node = findRecipeNode(wrap(json));
  expect(node).not.toBeNull();
  return recipeFromJsonLd(node!, url);
};

describe("isoDurationMinutes", () => {
  it.each([
    ["PT1H30M", 90],
    ["PT45M", 45],
    ["PT2H", 120],
    ["P0DT1H0M", 60],
  ])("%s → %i", (value, minutes) => {
    expect(isoDurationMinutes(value)).toBe(minutes);
  });

  it("returns null for anything that isn't a duration", () => {
    expect(isoDurationMinutes("soon")).toBeNull();
    expect(isoDurationMinutes(undefined)).toBeNull();
  });
});

describe("findRecipeNode", () => {
  it("finds a recipe inside @graph", () => {
    const node = findRecipeNode(
      wrap({ "@graph": [{ "@type": "WebSite" }, { "@type": "Recipe", name: "X" }] }),
    );
    expect(node?.name).toBe("X");
  });

  it("finds a recipe hanging off mainEntity", () => {
    const node = findRecipeNode(
      wrap({ "@type": "WebPage", mainEntity: { "@type": "Recipe", name: "X" } }),
    );
    expect(node?.name).toBe("X");
  });

  it("matches a multi-typed node", () => {
    const node = findRecipeNode(wrap({ "@type": ["Recipe", "NewsArticle"], name: "X" }));
    expect(node?.name).toBe("X");
  });

  it("skips a malformed block to reach a good one", () => {
    const html = `<script type="application/ld+json">{not json}</script>
      <script type='application/ld+json'>{"@type":"Recipe","name":"Toast"}</script>`;
    expect(findRecipeNode(html)?.name).toBe("Toast");
  });

  it("returns null when there's no recipe", () => {
    expect(findRecipeNode("<html><body>hi</body></html>")).toBeNull();
    expect(findRecipeNode(wrap({ "@type": "Article", name: "x" }))).toBeNull();
  });
});

describe("recipeFromJsonLd", () => {
  it("maps the fields a typical site publishes", () => {
    const recipe = read(
      {
        "@type": "Recipe",
        name: "Best Banana Bread",
        author: { "@type": "Person", name: "Jo Cook" },
        description: "Moist &amp; easy banana bread.",
        prepTime: "PT15M",
        cookTime: "PT1H",
        recipeYield: ["1 loaf", "12 servings"],
        recipeCategory: ["Dessert"],
        recipeIngredient: ["3 ripe bananas", "1&#189; cups all-purpose flour"],
        recipeInstructions: [
          { "@type": "HowToStep", text: "<p>Heat the oven to 350&deg;F.</p>" },
          { "@type": "HowToStep", text: "Mash the bananas." },
        ],
      },
      "https://example.com/banana",
    );

    expect(recipe.title).toBe("Best Banana Bread");
    expect(recipe.time).toBe("75"); // prep + cook when there's no totalTime
    expect(recipe.servings).toBe("1");
    expect(recipe.sourceName).toBe("Jo Cook");
    expect(recipe.ingredients[1]).toEqual({
      qty: "1.5",
      unit: "cups",
      name: "all-purpose flour",
    });
    expect(recipe.steps[0]).toBe("Heat the oven to 350°F."); // tags and entities gone
    expect(recipe.notes).toContain("Moist & easy banana bread.");
    expect(recipe.notes).toContain("https://example.com/banana");
  });

  it("prefers totalTime over the parts", () => {
    const recipe = read({
      "@type": "Recipe",
      name: "X",
      totalTime: "PT2H",
      prepTime: "PT10M",
      recipeInstructions: "Go.",
    });
    expect(recipe.time).toBe("120");
  });

  it("flattens HowToSections into a single list of steps", () => {
    const recipe = read({
      "@type": "Recipe",
      name: "Lasagne",
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Sauce",
          itemListElement: [
            { "@type": "HowToStep", text: "Brown the mince." },
            { "@type": "HowToStep", text: "Simmer 40 minutes." },
          ],
        },
        {
          "@type": "HowToSection",
          name: "Assembly",
          itemListElement: [{ "@type": "HowToStep", text: "Layer and bake." }],
        },
      ],
    });

    expect(recipe.steps).toEqual([
      "Brown the mince.",
      "Simmer 40 minutes.",
      "Layer and bake.",
    ]);
  });

  it("splits instructions delivered as one numbered blob", () => {
    const recipe = read({
      "@type": "Recipe",
      name: "Omelette",
      recipeYield: "Serves 2",
      recipeInstructions: "1. Beat the eggs. 2. Melt butter. 3. Cook 2 minutes.",
    });

    expect(recipe.servings).toBe("2");
    expect(recipe.steps).toHaveLength(3);
    expect(recipe.steps[0]).toBe("Beat the eggs.");
  });

  /** Sites that offer a 2x batch publish both lists in one array, so a
   *  four-ingredient recipe arrives as eight. */
  describe("scaled repeats", () => {
    it("keeps the unscaled half when the back half repeats the front", () => {
      const recipe = read({
        "@type": "Recipe",
        name: "Whipped Cream",
        recipeIngredient: [
          "8 ounces mascarpone",
          "1 1/4 cups heavy cream",
          "16 ounces mascarpone",
          "2 1/2 cups heavy cream",
        ],
        recipeInstructions: "Beat.",
      });

      expect(recipe.ingredients).toHaveLength(2);
      expect(recipe.ingredients[0].qty).toBe("8");
    });

    it("leaves a real list that merely repeats one ingredient", () => {
      const recipe = read({
        "@type": "Recipe",
        name: "Pie",
        recipeIngredient: ["2 cups flour", "1 cup butter", "1 tsp salt", "2 tbsp flour"],
        recipeInstructions: "Mix.",
      });

      expect(recipe.ingredients).toHaveLength(4);
    });
  });
});
