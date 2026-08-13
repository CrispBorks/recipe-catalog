import { describe, expect, it } from "vitest";

import { parseIngredientLine, parseRecipeText } from "../src/lib/parse-recipe-text";

/** Every case here is a line a real recipe site actually publishes. When the
 *  parser trips on a new one, add it here first — that's how the list grew. */
describe("parseIngredientLine", () => {
  const cases: [line: string, qty: string, unit: string, name: string][] = [
    ["1 lb large shrimp, peeled", "1", "lb", "large shrimp, peeled"],
    ["5 cloves garlic, minced", "5", "cloves", "garlic, minced"],
    ["1/2 tsp red pepper flakes", "0.5", "tsp", "red pepper flakes"],
    ["¾ cup heavy cream", "0.75", "cup", "heavy cream"],
    ["200g plain flour", "200", "g", "plain flour"],
    ["2 cans chickpeas, drained", "2", "cans", "chickpeas, drained"],

    // sizes are not units
    ["2 large eggs", "2", "", "large eggs"],

    // ranges keep the lower bound; the single qty field can't hold both
    ["2-3 cloves garlic", "2", "cloves", "garlic"],
    ["2 to 3 tablespoons olive oil", "2", "tbsp", "olive oil"],

    // approximations
    ["about 2 cups flour", "2", "cups", "flour"],

    // mixed numbers, including the spelled-out form
    ["1½ cups brown sugar", "1.5", "cups", "brown sugar"],
    ["2 and 1/3 cups (275g) cake flour", "2.333", "cups", "cake flour"],
    ["1 and 1/2 teaspoons pure vanilla extract", "1.5", "tsp", "pure vanilla extract"],

    // amounts restated in other units, one or several
    ["8 ounces (226g) mascarpone cheese", "8", "oz", "mascarpone cheese"],
    ["1 1/4 cups (296 ml) heavy cream", "1.25", "cups", "heavy cream"],
    ["3/4 cup (12 Tbsp; 170g) unsalted butter", "0.75", "cup", "unsalted butter"],

    // no quantity at all
    ["Salt and pepper to taste", "", "", "Salt and pepper to taste"],
    ["pinch of salt, to taste", "", "", "pinch of salt, to taste"],
  ];

  it.each(cases)("%s", (line, qty, unit, name) => {
    expect(parseIngredientLine(line)).toEqual({ qty, unit, name });
  });

  /** The restated-amount rule is the one most likely to eat something real,
   *  so its boundary gets its own tests. */
  describe("keeps parentheticals that aren't restatements", () => {
    it("keeps the only measurement on the line", () => {
      // No unit of its own, so "(14 oz)" is the can's size, not a repeat
      expect(parseIngredientLine("1 (14 oz) can coconut milk").name).toBe(
        "(14 oz) can coconut milk",
      );
    });

    it("keeps qualifiers that aren't measurements", () => {
      expect(parseIngredientLine("1 1/2 cups (packed) brown sugar").name).toBe(
        "(packed) brown sugar",
      );
    });

    it("keeps trailing parentheticals", () => {
      expect(parseIngredientLine("2 cups flour (250g)").name).toBe("flour (250g)");
      expect(parseIngredientLine("1 whole chicken (about 4 lb)").name).toBe(
        "whole chicken (about 4 lb)",
      );
    });

    it("does not mistake a plain 'and' for a mixed number", () => {
      expect(parseIngredientLine("2 cups salt and pepper mix").name).toBe(
        "salt and pepper mix",
      );
    });
  });
});

describe("parseRecipeText", () => {
  it("reads a recipe with headings", () => {
    const parsed = parseRecipeText(`Garlic Butter Shrimp

Prep Time: 10 mins
Cook Time: 12 mins
Serves 3
Tags: dinner, seafood

Ingredients
1 lb large shrimp, peeled
4 tbsp butter

Instructions
1. Melt the butter in a wide skillet.
2. Add the shrimp and cook 3 minutes per side.

Notes
Serve over rice.`);

    expect(parsed.title).toBe("Garlic Butter Shrimp");
    expect(parsed.time).toBe("22");
    expect(parsed.servings).toBe("3");
    expect(parsed.tags).toEqual(["dinner", "seafood"]);
    expect(parsed.ingredients).toHaveLength(2);
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.notes).toEqual(["Serve over rice."]);
    expect(parsed.sectioned).toBe(true);
  });

  it("takes the cook time from the preamble only", () => {
    // "Roast" appears in the title and again as a step verb with a duration
    const parsed = parseRecipeText(`Lemon Garlic Roast Chicken

Prep Time: 15 mins
Cook Time: 1 hr

Ingredients
1 whole chicken

Instructions
1. Roast 60-70 minutes until done.`);

    expect(parsed.time).toBe("75");
  });

  it("files a group header as a note, not an ingredient", () => {
    const parsed = parseRecipeText(`Pudding

Ingredients
For the sauce:
100g butter

Instructions
Melt it.`);

    expect(parsed.ingredients).toHaveLength(1);
    expect(parsed.notes).toContain("For the sauce:");
  });

  describe("without headings", () => {
    it("splits ingredients from steps", () => {
      const parsed = parseRecipeText(`Quick Cucumber Salad
2 cucumbers
1 tbsp rice vinegar
Slice the cucumbers thinly.
Toss with the vinegar and chill.`);

      expect(parsed.ingredients).toHaveLength(2);
      expect(parsed.steps).toHaveLength(2);
      expect(parsed.sectioned).toBe(false);
    });

    it("does not read a cooking verb as a unit", () => {
      // "slice", "dash", "pinch" and "stick" are units and also verbs
      const parsed = parseRecipeText(`Salad
1 cucumber
Slice the cucumbers thinly.`);

      expect(parsed.ingredients.map((i) => i.name)).not.toContain(
        "the cucumbers thinly.",
      );
    });
  });
});
