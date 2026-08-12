import * as React from "react";

import { formatQty, type Ingredient } from "@/lib/recipes";

export type UnitSystem = "imperial" | "metric";

const STORAGE_KEY = "cardCatalog.units.v1";

/** Culinary metric, not exact US customary. Recipes are written with a 15 ml
 *  tablespoon and a 5 ml teaspoon; converting at the true 14.787 ml turns
 *  "3 tbsp" into "44 ml", which no recipe would ever print. */
const ML_PER_CUP = 240;

const VOLUME_ML: Record<string, number> = {
  cup: ML_PER_CUP,
  cups: ML_PER_CUP,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  "fl oz": 30,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
};

const MASS_G: Record<string, number> = {
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
};

const METRIC_UNITS = new Set(["ml", "l", "g", "kg"]);

/** Grams per US cup, for ingredients where cooks genuinely weigh rather than
 *  measure by volume. Deliberately dry and semi-solid goods only: converting a
 *  liquid to grams is possible but unhelpful (metric recipes call for millilitres
 *  of milk, not grams), and converting something loose and chunky like broccoli
 *  florets would invent a precision that doesn't exist. Anything not listed here
 *  becomes millilitres, which is always dimensionally correct. */
const GRAMS_PER_CUP: [string, number][] = [
  // More specific names first — "brown sugar" must beat "sugar".
  ["brown sugar", 220],
  ["powdered sugar", 120],
  ["confectioners sugar", 120],
  ["peanut butter", 258],
  ["cooked rice", 175],
  ["chocolate chips", 170],
  ["cocoa", 85],
  ["breadcrumbs", 108],
  ["bread crumbs", 108],
  ["rolled oats", 90],
  ["oats", 90],
  ["flour", 125],
  ["sugar", 200],
  ["butter", 227],
  ["honey", 340],
  ["maple syrup", 322],
  ["parmesan", 100],
  ["lentils", 192],
  ["rice", 185],
];

const normalizeUnit = (unit: string) => unit.trim().toLowerCase();

export function isMetricUnit(unit: string): boolean {
  return METRIC_UNITS.has(normalizeUnit(unit));
}

function densityFor(name: string): number | null {
  const lower = name.toLowerCase();
  for (const [needle, gramsPerCup] of GRAMS_PER_CUP) {
    if (lower.includes(needle)) return gramsPerCup / ML_PER_CUP;
  }
  return null;
}

/** Cooking precision, not laboratory precision — nobody measures 112 g of honey. */
function roundSensibly(value: number): number {
  if (value >= 100) return Math.round(value / 10) * 10;
  if (value >= 20) return Math.round(value / 5) * 5;
  if (value >= 10) return Math.round(value);
  return Math.round(value * 2) / 2;
}

/** Converts an ingredient into the requested system. Amounts already in the
 *  target system are returned untouched, so switching back and forth can't
 *  drift (1 cup → 240 ml → 1.01 cup). Counts — cloves, cans, pinches, bare
 *  numbers — have no system and always pass through. */
export function convertIngredient(ing: Ingredient, system: UnitSystem): Ingredient {
  if (typeof ing.qty !== "number") return ing;

  const unit = normalizeUnit(ing.unit);
  const volume = VOLUME_ML[unit];
  const mass = MASS_G[unit];
  if (volume === undefined && mass === undefined) return ing;

  const alreadyMetric = isMetricUnit(unit);
  if (system === "metric" && alreadyMetric) return ing;
  if (system === "imperial" && !alreadyMetric) return ing;

  if (system === "metric") {
    if (mass !== undefined) {
      const grams = ing.qty * mass;
      return grams >= 1000
        ? { ...ing, qty: roundSensibly(grams / 10) / 100, unit: "kg" }
        : { ...ing, qty: roundSensibly(grams), unit: "g" };
    }
    const millilitres = ing.qty * volume;
    const density = densityFor(ing.name);
    if (density) {
      return { ...ing, qty: roundSensibly(millilitres * density), unit: "g" };
    }
    return millilitres >= 1000
      ? { ...ing, qty: roundSensibly(millilitres / 10) / 100, unit: "l" }
      : { ...ing, qty: roundSensibly(millilitres), unit: "ml" };
  }

  // Metric source data back to imperial: pick the largest unit that doesn't
  // produce an awkward fraction.
  if (mass !== undefined) {
    const grams = ing.qty * mass;
    return grams >= 453.592
      ? { ...ing, qty: Math.round((grams / 453.592) * 4) / 4, unit: "lb" }
      : { ...ing, qty: Math.round((grams / 28.3495) * 2) / 2, unit: "oz" };
  }
  const millilitres = ing.qty * volume;
  if (millilitres >= ML_PER_CUP / 2)
    return { ...ing, qty: Math.round((millilitres / ML_PER_CUP) * 8) / 8, unit: "cup" };
  if (millilitres >= 14.787)
    return { ...ing, qty: Math.round(millilitres / 14.787), unit: "tbsp" };
  return { ...ing, qty: Math.round((millilitres / 4.929) * 4) / 4, unit: "tsp" };
}

/** Imperial amounts read best as fractions (1½ cup); metric ones as plain
 *  decimals — "2½ ml" would be nonsense. */
export function formatAmount(qty: number | string | undefined, unit: string): string {
  if (typeof qty !== "number") return qty ?? "";
  if (!isMetricUnit(unit)) return formatQty(qty);
  return String(Math.round(qty * 100) / 100);
}

function readStored(): UnitSystem {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "metric" ? "metric" : "imperial";
  } catch {
    return "imperial";
  }
}

let current: UnitSystem = readStored();
const listeners = new Set<() => void>();

/** Shared so the choice sticks across recipes and page loads — someone who
 *  cooks in grams cooks in grams every time. */
export function useUnitSystem(): [UnitSystem, (next: UnitSystem) => void] {
  const system = React.useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => current,
  );

  const setSystem = React.useCallback((next: UnitSystem) => {
    current = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — the choice still holds for this session */
    }
    listeners.forEach((fn) => fn());
  }, []);

  return [system, setSystem];
}
