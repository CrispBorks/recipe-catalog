/** Turns a blob of pasted recipe text into the builder's form fields.
 *
 *  Splitting a single ingredient line into quantity/unit/name is delegated to
 *  `parse-ingredient`, which knows far more unit spellings, range forms and
 *  quantity oddities than is worth maintaining here. Everything above that —
 *  finding the title, the sections, the steps — is still local heuristics, and
 *  the output is a starting point the user edits, never something saved
 *  unreviewed, so it leans towards keeping text (in notes) rather than dropping
 *  anything it can't classify. */

import { parseIngredient } from "parse-ingredient";

export type ParsedIngredient = { qty: string; unit: string; name: string };

export type ParsedRecipe = {
  title: string;
  /** Form fields are strings, so these are too. */
  time: string;
  servings: string;
  tags: string[];
  ingredients: ParsedIngredient[];
  steps: string[];
  notes: string[];
  /** True when explicit "Ingredients"/"Method" headings were found, which
   *  makes the result far more trustworthy than the fallback classifier. */
  sectioned: boolean;
};

type Section = "ingredients" | "steps" | "notes";

const SECTION_HEADINGS: [Section, RegExp][] = [
  [
    "ingredients",
    /^(?:#+\s*)?(?:ingredients?|you'?ll need|what you(?:'ll)? need|shopping list)\s*:?$/i,
  ],
  [
    "steps",
    /^(?:#+\s*)?(?:instructions?|directions?|method|steps|preparation|how to make(?: it)?)\s*:?$/i,
  ],
  [
    "notes",
    /^(?:#+\s*)?(?:notes?|tips?|variations?|to serve|serving suggestions?|source|storage)\s*:?$/i,
  ],
];

const BULLET = /^[-–—*•·▢□]\s*/;
const STEP_NUMBER = /^(?:step\s*)?\d+\s*[.):-]\s+/i;

const clean = (line: string) => line.replace(BULLET, "").trim();

/** Only used to decide whether a *headingless* line is an ingredient at all.
 *  parse-ingredient does the actual splitting, but it can't be used for this
 *  test: it also extracts trailing quantities, so "Preheat oven to 425F."
 *  comes back with a quantity of 425 and would be filed as an ingredient. */
const QUANTITY = new RegExp(
  "^(" +
    "\\d+\\s+\\d+\\/\\d+" + // 1 1/2
    "|\\d+\\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]" + // 1½
    "|\\d+\\/\\d+" + // 1/2
    "|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]" + // ½
    "|\\d+[.,]\\d+" + // 1.5
    "|\\d+" + // 2
  ")" +
    // an optional range: "2-3", "2 to 3" — we keep the lower bound
    "(?:\\s*(?:-|–|—|to)\\s*(?:\\d+(?:[.,]\\d+)?|\\d+\\/\\d+|[½⅓⅔¼¾]))?" +
    "\\s*",
);

/** "large"/"medium"/"small" are sizes, not units — left alone they'd be read
 *  as the unit of "2 large eggs" and the egg would lose its adjective. */
const IGNORED_UNITS = ["small", "medium", "large", "extra", "whole", "half"];

/** parse-ingredient reads a leading "about" as part of the description, which
 *  then reads as an ingredient named "about 2 cups flour". */
const APPROX_PREFIXES = ["approximately", "approx.", "approx", "about", "around", "roughly"];

const APPROX_MATCH = new RegExp(
  `^(?:${APPROX_PREFIXES.map((p) => p.replace(".", "\\.?")).join("|")})\\s+`,
  "i",
);

const PARSE_OPTIONS = {
  ignoreUOMs: IGNORED_UNITS,
  leadingQuantityPrefixes: APPROX_PREFIXES,
};

/** The catalog writes units the way a recipe card does — "3 tbsp", "5 cloves",
 *  "1½ cups" — so the library's canonical ids are mapped back to those. The
 *  built-in `short` form isn't usable directly: it abbreviates cup to "c". */
const UNIT_NAMES: Record<string, string> = {
  tablespoon: "tbsp",
  teaspoon: "tsp",
  ounce: "oz",
  pound: "lb",
  gram: "g",
  kilogram: "kg",
  milliliter: "ml",
  liter: "l",
  fluidounce: "fl oz",
  milligram: "mg",
};

/** Abbreviations never take an "s"; spelled-out units do. */
const PLURALISES = /^[a-z]{3,}$/;

function unitLabel(id: string | null, spelled: string | null, qty: number | null): string {
  if (!id) return spelled ? spelled.toLowerCase() : "";
  const base = UNIT_NAMES[id] ?? id;
  // Fractions stay singular — recipes write "¾ cup", never "¾ cups".
  if (qty !== null && qty > 1 && PLURALISES.test(base) && !UNIT_NAMES[id]) {
    return base.endsWith("h") || base.endsWith("s") ? `${base}es` : `${base}s`;
  }
  return base;
}

/** Recipe sites often restate the amount in the other measurement system right
 *  after it: "1 1/4 cups (296 ml) heavy cream". Once the quantity has been read
 *  off the front, that parenthetical is a duplicate, and left alone it becomes
 *  part of the ingredient's name.
 *
 *  Only a *leading* parenthetical is dropped, and only one that is nothing but
 *  a number and a unit. A trailing one qualifies the ingredient rather than
 *  repeating the amount — "1 whole chicken (about 4 lb)" needs its weight — and
 *  "(packed)" or "(plus more for dusting)" aren't measurements at all. */
const RESTATED_AMOUNT =
  /^\(\s*(?:about\s+|approx\.?\s+|~\s*)?[\d]+(?:[.,]\d+)?(?:\s*[-–/]\s*\d+(?:[.,]\d+)?)?\s*(?:g|kg|mg|ml|l|oz|lb|lbs|grams?|kilograms?|milliliters?|liters?|ounces?|pounds?)\s*\)\s*/i;

export function parseIngredientLine(line: string): ParsedIngredient {
  const text = clean(line);

  // Without a quantity up front there is nothing to split off, and letting the
  // library hunt for one further into the line does more harm than good:
  // "Juice of 3 lemons" comes back as 3 × "Juice of lemons".
  if (!QUANTITY.test(text.replace(APPROX_MATCH, ""))) {
    return { qty: "", unit: "", name: text };
  }

  const [parsed] = parseIngredient(text, PARSE_OPTIONS);
  if (!parsed) return { qty: "", unit: "", name: text };

  // Ranges ("2-3 cloves") keep the lower bound, which is what the single
  // numeric qty field can hold; the user scales from there anyway.
  const qty = parsed.quantity;

  return {
    qty: qty === null ? "" : String(Math.round(qty * 1000) / 1000),
    unit: unitLabel(parsed.unitOfMeasureID, parsed.unitOfMeasure, qty),
    name: parsed.description.replace(RESTATED_AMOUNT, "").trim(),
  };
}

/** True for lines like "For the icing:" — a label for the ingredients that
 *  follow rather than an ingredient itself. */
export function isIngredientGroupHeader(line: string): boolean {
  const [parsed] = parseIngredient(clean(line), PARSE_OPTIONS);
  return parsed?.isGroupHeader === true;
}

/** Hours and minutes are searched for independently — a single combined
 *  pattern with both parts optional happily matches the empty string at
 *  position 0 and reports nothing. */
function durationMinutes(text: string): number | null {
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?\b|hrs?\b|h\b)/i);
  const mins = text.match(/(\d+)\s*(?:minutes?\b|mins?\b|m\b)/i);
  if (!hours && !mins) return null;
  const total = (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0);
  return total > 0 ? total : null;
}

/** Only used when there are no headings to go on, so it errs towards calling
 *  something a step: a wrong step is obvious in the form, a wrong ingredient
 *  is easy to miss. A leading quantity is required — several unit words
 *  ("slice", "dash", "pinch", "stick") are also cooking verbs, and matching on
 *  those alone turns "Slice the cucumbers thinly." into an ingredient. */
function looksLikeIngredient(line: string): boolean {
  const text = clean(line);
  if (text === "" || text.length > 80) return false;
  if (!QUANTITY.test(text)) return false;
  // "2 minutes before serving, add the herbs." starts with a number but is
  // plainly a sentence; ingredient lines are short and rarely end in a stop.
  if (/[.!?]$/.test(text) && text.split(/\s+/).length > 5) return false;
  return true;
}

function splitSteps(lines: string[]): string[] {
  const numbered = lines.filter((line) => STEP_NUMBER.test(line.trim()));
  if (numbered.length >= 2) {
    const steps: string[] = [];
    lines.forEach((line) => {
      const text = line.trim();
      if (text === "") return;
      if (STEP_NUMBER.test(text)) steps.push(text.replace(STEP_NUMBER, "").trim());
      else if (steps.length > 0) steps[steps.length - 1] += ` ${text}`;
      else steps.push(text);
    });
    return steps.map((s) => s.trim()).filter(Boolean);
  }

  // Without numbering, a line continues the previous step only when that step
  // hasn't finished a sentence — which is what a hard-wrapped paragraph looks
  // like. A blank line always starts a new step.
  const steps: string[] = [];
  let forceBreak = true;

  lines.forEach((line) => {
    const text = clean(line);
    if (text === "") {
      forceBreak = true;
      return;
    }
    const previous = steps[steps.length - 1];
    if (forceBreak || previous === undefined || /[.!?:]$/.test(previous)) {
      steps.push(text);
    } else {
      steps[steps.length - 1] = `${previous} ${text}`;
    }
    forceBreak = false;
  });

  return steps.map((s) => s.trim()).filter(Boolean);
}

export function parseRecipeText(input: string): ParsedRecipe {
  const raw = input.replace(/\r\n?/g, "\n");
  const lines = raw.split("\n");

  const result: ParsedRecipe = {
    title: "",
    time: "",
    servings: "",
    tags: [],
    ingredients: [],
    steps: [],
    notes: [],
    sectioned: false,
  };

  const metadataLine = (line: string) =>
    /^\s*(?:total|prep(?:aration)?|cook(?:ing)?|bake|active|ready in|serves|servings?|yields?|makes|tags?|difficulty|course|cuisine|calories|author|by)\b[^\n]{0,40}$/i.test(
      line,
    ) && line.trim().length < 60;

  // --- split into sections ------------------------------------------------
  const buckets: Record<Section, string[]> = { ingredients: [], steps: [], notes: [] };
  const preamble: string[] = [];
  let current: Section | null = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    const heading = SECTION_HEADINGS.find(([, pattern]) => pattern.test(trimmed));
    if (heading) {
      current = heading[0];
      result.sectioned = true;
      return;
    }
    if (current) buckets[current].push(line);
    else preamble.push(line);
  });

  // --- metadata, read only from the preamble ------------------------------
  // Scoping this to the text above the first heading matters: a title like
  // "Lemon Garlic Roast Chicken" contains "roast", and a step reading
  // "Roast 60-70 minutes" would otherwise be mistaken for a cook time.
  const preambleText = preamble.join("\n");

  const labelledMinutes = (label: RegExp): number | null => {
    for (const line of preamble) {
      if (!label.test(line)) continue;
      const value = durationMinutes(line.replace(label, " "));
      if (value !== null && value > 0) return value;
    }
    return null;
  };

  const total = labelledMinutes(/\btotal\b/i);
  const prep = labelledMinutes(/\bprep(?:aration)?\b/i);
  const cook = labelledMinutes(/\b(?:cook|bake|roast|active)(?:ing)?\b/i);
  const minutes = total ?? (prep || cook ? (prep ?? 0) + (cook ?? 0) : null);
  if (minutes && minutes > 0) result.time = String(Math.round(minutes));

  const servings =
    preambleText.match(
      /(?:serves|servings?|yields?|makes)\s*[:–-]?\s*(?:about\s*)?(\d+)/i,
    ) ?? preambleText.match(/(\d+)\s*servings?\b/i);
  if (servings) result.servings = servings[1];

  const tagLine = preambleText.match(/^\s*tags?\s*[:–-]\s*(.+)$/im);
  if (tagLine) {
    result.tags = tagLine[1]
      .split(/[,;/]/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }

  // --- title: the first real line of the preamble --------------------------
  const titleLine = preamble.find(
    (line) => line.trim() !== "" && !metadataLine(line) && !/^https?:\/\//i.test(line.trim()),
  );
  if (titleLine) {
    result.title = titleLine.replace(/^#+\s*/, "").replace(/\s*[:.]$/, "").trim();
  }

  // Anything else in the preamble is either metadata we already used, a URL,
  // or a description — the last of which belongs in notes.
  preamble.forEach((line) => {
    const trimmed = clean(line);
    if (trimmed === "" || line === titleLine) return;
    if (metadataLine(line)) return;
    if (!result.sectioned) return; // handled by the fallback classifier below
    result.notes.push(trimmed);
  });

  if (result.sectioned) {
    buckets.ingredients
      .map(clean)
      .filter(Boolean)
      .forEach((line) => {
        // "For the marinade:" labels the lines beneath it. It has no quantity
        // and no unit, so as an ingredient row it is pure noise — but it is
        // real information, so it goes to notes rather than being dropped.
        if (isIngredientGroupHeader(line)) result.notes.push(line);
        else result.ingredients.push(parseIngredientLine(line));
      });

    result.steps = splitSteps(buckets.steps);

    buckets.notes
      .map(clean)
      .filter(Boolean)
      .forEach((line) => result.notes.push(line));

    return result;
  }

  // --- no headings: classify line by line ---------------------------------
  const body = preamble.filter((line) => line !== titleLine);
  const stepLines: string[] = [];

  body.forEach((line) => {
    const trimmed = clean(line);
    if (trimmed === "") {
      stepLines.push("");
      return;
    }
    if (metadataLine(line)) return;
    if (/^https?:\/\//i.test(trimmed)) {
      result.notes.push(trimmed);
      return;
    }
    if (STEP_NUMBER.test(trimmed)) {
      stepLines.push(trimmed);
      return;
    }
    if (looksLikeIngredient(trimmed) && stepLines.filter(Boolean).length === 0) {
      result.ingredients.push(parseIngredientLine(trimmed));
      return;
    }
    stepLines.push(trimmed);
  });

  result.steps = splitSteps(stepLines);
  return result;
}

/** A short, honest summary of what the parser managed to find. */
export function describeParse(parsed: ParsedRecipe): string[] {
  const found: string[] = [];
  if (parsed.title) found.push("title");
  if (parsed.time) found.push(`${parsed.time} min`);
  if (parsed.servings) found.push(`serves ${parsed.servings}`);
  if (parsed.ingredients.length)
    found.push(
      `${parsed.ingredients.length} ingredient${parsed.ingredients.length === 1 ? "" : "s"}`,
    );
  if (parsed.steps.length)
    found.push(`${parsed.steps.length} step${parsed.steps.length === 1 ? "" : "s"}`);
  if (parsed.notes.length)
    found.push(`${parsed.notes.length} note${parsed.notes.length === 1 ? "" : "s"}`);
  if (parsed.tags.length) found.push(`${parsed.tags.length} tags`);
  return found;
}
