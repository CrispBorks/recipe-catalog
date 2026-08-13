import { describe, expect, it } from "vitest";

import { assembleRecipe, formatQty, matchesQuery, scaleIngredient } from "../src/lib/recipes";

describe("assembleRecipe", () => {
  it("drops empty fields rather than saving them as blank", () => {
    expect(
      assembleRecipe({
        id: " test-soup ",
        title: "  Test Soup  ",
        time: "",
        servings: "  ",
        tags: [],
        ingredients: [{ qty: "", unit: "", name: "  " }],
        steps: ["", "  "],
        notes: [],
      }),
    ).toEqual({ id: "test-soup", title: "Test Soup" });
  });

  it("keeps a quantity that isn't a number", () => {
    // "to taste" is a legitimate amount; losing it is worse than not scaling it
    const recipe = assembleRecipe({
      id: "x",
      title: "X",
      ingredients: [{ qty: "to taste", unit: "", name: "salt" }],
    });
    expect(recipe.ingredients?.[0].qty).toBe("to taste");
  });

  it("converts numeric strings to numbers", () => {
    const recipe = assembleRecipe({
      id: "x",
      title: "X",
      time: "30",
      servings: "4",
      ingredients: [{ qty: "1.5", unit: "cups", name: "flour" }],
    });
    expect(recipe.time).toBe(30);
    expect(recipe.servings).toBe(4);
    expect(recipe.ingredients?.[0].qty).toBe(1.5);
  });
});

describe("formatQty", () => {
  it.each([
    [0.5, "½"],
    [0.75, "¾"],
    [1.5, "1½"],
    [2, "2"],
    // A quantity that has no tidy fraction still has to read like a measurement
    [1 / 12, "1/12"],
  ])("%s → %s", (value, shown) => {
    expect(formatQty(value)).toBe(shown);
  });
});

describe("scaleIngredient", () => {
  it("scales a numeric quantity", () => {
    expect(scaleIngredient({ qty: 2, unit: "cups", name: "flour" }, 1.5).qty).toBe(3);
  });

  it("leaves a non-numeric quantity alone", () => {
    expect(scaleIngredient({ qty: "to taste", unit: "", name: "salt" }, 2).qty).toBe(
      "to taste",
    );
  });
});

describe("matchesQuery", () => {
  const recipe = {
    id: "chickpea-bowl",
    title: "Sheet-Pan Chickpea Bowl",
    tags: ["vegan", "dinner"],
    ingredients: [{ qty: 1, unit: "can", name: "chickpeas" }],
  };

  it.each(["chickpea", "CHICKPEA", "vegan", "sheet"])("matches %s", (query) => {
    expect(matchesQuery(recipe, query)).toBe(true);
  });

  it("does not match something absent", () => {
    expect(matchesQuery(recipe, "salmon")).toBe(false);
  });

  it("matches everything on an empty query", () => {
    expect(matchesQuery(recipe, "")).toBe(true);
  });
});
