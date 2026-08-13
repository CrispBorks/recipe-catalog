/** Turns a blob of pasted recipe text into the builder's form fields.
 *
 *  Deliberately dependency-free so it can be unit-tested straight from node.
 *  Everything here is a heuristic — the output is a starting point the user
 *  edits, never something committed unreviewed, so it leans towards keeping
 *  text (in notes) rather than dropping anything it can't classify. */

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

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

// Longest first so "tablespoons" wins over "tbsp" and "cups" over "cup".
const UNITS = [
  "tablespoons", "tablespoon", "teaspoons", "teaspoon", "kilograms", "kilogram",
  "milliliters", "milliliter", "fluid ounces", "fluid ounce", "packages", "package",
  "handfuls", "handful", "gallons", "gallon", "bunches", "bunch", "pinches", "pinch",
  "quarts", "quart", "sprigs", "sprig", "sticks", "stick", "slices", "slice",
  "stalks", "stalk", "strips", "strip", "pieces", "piece", "cloves", "clove",
  "dashes", "dash", "grams", "gram", "heads", "head", "jars", "jar", "liters",
  "liter", "ounces", "ounce", "pints", "pint", "pounds", "pound", "cans", "can",
  "cups", "cup", "ribs", "rib", "tbsps", "tbsp", "tsps", "tsp", "lbs", "lb",
  "oz", "kg", "ml", "g", "l",
];

const BULLET = /^[-–—*•·▢□]\s*/;
const STEP_NUMBER = /^(?:step\s*)?\d+\s*[.):-]\s+/i;

const clean = (line: string) => line.replace(BULLET, "").trim();

function toNumber(raw: string): number | null {
  const text = raw.trim();

  // "1 1/2" or "1 ½"
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);

  const mixedGlyph = text.match(/^(\d+)\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/);
  if (mixedGlyph) return Number(mixedGlyph[1]) + UNICODE_FRACTIONS[mixedGlyph[2]];

  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);

  if (UNICODE_FRACTIONS[text] !== undefined) return UNICODE_FRACTIONS[text];

  const plain = Number(text.replace(",", "."));
  return Number.isFinite(plain) ? plain : null;
}

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

const UNIT_MATCH = new RegExp(`^(${UNITS.join("|")})\\b\\.?\\s*`, "i");

export function parseIngredientLine(line: string): ParsedIngredient {
  let rest = clean(line);

  const quantity = rest.match(QUANTITY);
  let qty = "";
  if (quantity) {
    const value = toNumber(quantity[1]);
    if (value !== null) {
      qty = String(Math.round(value * 1000) / 1000);
      rest = rest.slice(quantity[0].length);
    }
  }

  let unit = "";
  const unitMatch = rest.match(UNIT_MATCH);
  // A unit only counts if something is left to name — "2 cups" alone is
  // really an ingredient called "cups".
  if (unitMatch && rest.slice(unitMatch[0].length).trim() !== "") {
    unit = unitMatch[1].toLowerCase();
    rest = rest.slice(unitMatch[0].length);
  }

  return { qty, unit, name: rest.replace(/^of\s+/i, "").trim() };
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
      .forEach((line) => result.ingredients.push(parseIngredientLine(line)));

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
