import type { Ingredient, Recipe } from "@/lib/recipes";

export type Issue = { level: "error" | "warning"; message: string };

export type ReviewedRecipe = {
  index: number;
  /** Present whenever the entry is renderable, even if it carries warnings. */
  recipe: Recipe | null;
  label: string;
  issues: Issue[];
};

export type ParseOutcome =
  | { ok: false; message: string; line?: number; column?: number }
  | { ok: true; items: ReviewedRecipe[] };

/** Where a batch is going: appended to the current file, or replacing it
 *  wholesale. It changes what counts as a duplicate — pasting the whole file
 *  back after editing shouldn't flag every recipe in it. */
export type PasteMode = "append" | "update";

const KNOWN_KEYS = new Set([
  "id",
  "title",
  "tags",
  "time",
  "servings",
  "ingredients",
  "steps",
  "notes",
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/** V8 reports "... at position 61 (line 4 column 3)" on newer runtimes and only
 *  a position on older ones, so take the line/column if offered and work it out
 *  from the offset otherwise. */
function locateSyntaxError(text: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  const explicit = message.match(/line (\d+) column (\d+)/);
  if (explicit) {
    return { line: Number(explicit[1]), column: Number(explicit[2]) };
  }

  const offset = message.match(/position (\d+)/);
  if (offset) {
    const upTo = text.slice(0, Number(offset[1]));
    const lastBreak = upTo.lastIndexOf("\n");
    return { line: upTo.split("\n").length, column: upTo.length - lastBreak };
  }

  return {};
}

function reviewIngredients(value: unknown, issues: Issue[]): Ingredient[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.push({ level: "error", message: "`ingredients` must be a list." });
    return undefined;
  }

  const cleaned: Ingredient[] = [];
  value.forEach((row, i) => {
    if (!isPlainObject(row)) {
      issues.push({ level: "error", message: `Ingredient ${i + 1} is not an object.` });
      return;
    }
    if (!isNonEmptyString(row.name)) {
      issues.push({ level: "error", message: `Ingredient ${i + 1} needs a \`name\`.` });
      return;
    }
    if (
      row.qty !== undefined &&
      typeof row.qty !== "number" &&
      typeof row.qty !== "string"
    ) {
      issues.push({
        level: "error",
        message: `Ingredient ${i + 1} has a \`qty\` that is neither a number nor text.`,
      });
      return;
    }
    if (row.unit !== undefined && typeof row.unit !== "string") {
      issues.push({ level: "error", message: `Ingredient ${i + 1} has a non-text \`unit\`.` });
      return;
    }
    cleaned.push({
      qty: (row.qty as number | string) ?? "",
      unit: (row.unit as string) ?? "",
      name: row.name,
    });
  });

  return cleaned;
}

function reviewStringList(
  value: unknown,
  field: "steps" | "notes" | "tags",
  issues: Issue[],
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.push({ level: "error", message: `\`${field}\` must be a list.` });
    return undefined;
  }
  const bad = value.findIndex((entry) => !isNonEmptyString(entry));
  if (bad !== -1) {
    issues.push({
      level: "error",
      message: `\`${field}\` entry ${bad + 1} is not text.`,
    });
    return undefined;
  }
  return value as string[];
}

function reviewNumber(
  value: unknown,
  field: "time" | "servings",
  issues: Issue[],
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    issues.push({
      level: "error",
      message: `\`${field}\` must be a positive number.`,
    });
    return undefined;
  }
  return value;
}

function reviewOne(raw: unknown, index: number): ReviewedRecipe {
  const issues: Issue[] = [];

  if (!isPlainObject(raw)) {
    return {
      index,
      recipe: null,
      label: `Entry ${index + 1}`,
      issues: [{ level: "error", message: "This entry isn't a recipe object." }],
    };
  }

  const label = isNonEmptyString(raw.title) ? raw.title : `Entry ${index + 1}`;

  if (!isNonEmptyString(raw.id)) {
    issues.push({ level: "error", message: "Missing `id` — every recipe needs a slug." });
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.id)) {
    issues.push({
      level: "warning",
      message: `\`id\` "${raw.id}" isn't a clean slug — lowercase letters, numbers and hyphens travel best in a URL.`,
    });
  }

  if (!isNonEmptyString(raw.title)) {
    issues.push({ level: "error", message: "Missing `title`." });
  }

  const tags = reviewStringList(raw.tags, "tags", issues);
  const time = reviewNumber(raw.time, "time", issues);
  const servings = reviewNumber(raw.servings, "servings", issues);
  const ingredients = reviewIngredients(raw.ingredients, issues);
  const steps = reviewStringList(raw.steps, "steps", issues);
  const notes = reviewStringList(raw.notes, "notes", issues);

  const unknown = Object.keys(raw).filter((key) => !KNOWN_KEYS.has(key));
  if (unknown.length > 0) {
    issues.push({
      level: "warning",
      message: `Ignored unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`,
    });
  }

  if (!ingredients?.length && !steps?.length && !notes?.length) {
    issues.push({
      level: "warning",
      message: "No ingredients, steps or notes — this will render as an empty card.",
    });
  }

  if (issues.some((issue) => issue.level === "error")) {
    return { index, recipe: null, label, issues };
  }

  return {
    index,
    label,
    issues,
    recipe: {
      id: raw.id as string,
      title: raw.title as string,
      ...(tags?.length ? { tags } : {}),
      ...(time !== undefined ? { time } : {}),
      ...(servings !== undefined ? { servings } : {}),
      ...(ingredients?.length ? { ingredients } : {}),
      ...(steps?.length ? { steps } : {}),
      ...(notes?.length ? { notes } : {}),
    },
  };
}

export function parseAndReview(
  text: string,
  existingIds: string[],
  mode: PasteMode,
): ParseOutcome {
  if (text.trim() === "") {
    return { ok: false, message: "Nothing pasted yet." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const where = locateSyntaxError(text, error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "That isn't valid JSON.",
      ...where,
    };
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0) {
    return { ok: false, message: "That's an empty list — no recipes to add." };
  }

  const items = list.map(reviewOne);

  // Duplicates: always within the batch, and against the catalog only when
  // adding new ones — an update batch is meant to carry ids that already exist.
  const seen = new Map<string, number>();
  const existing = new Set(existingIds);

  items.forEach((item) => {
    const id = item.recipe?.id;
    if (!id) return;

    const firstAt = seen.get(id);
    if (firstAt !== undefined) {
      item.issues.push({
        level: "error",
        message: `Duplicate \`id\` "${id}" — also used by entry ${firstAt + 1} in this paste.`,
      });
      item.recipe = null;
      return;
    }
    seen.set(id, item.index);

    if (mode === "append" && existing.has(id)) {
      item.issues.push({
        level: "error",
        message: `\`id\` "${id}" already exists in the catalog. Rename it, or switch to "Update existing".`,
      });
      item.recipe = null;
    }
  });

  return { ok: true, items };
}

export const countErrors = (items: ReviewedRecipe[]) =>
  items.filter((item) => item.issues.some((i) => i.level === "error")).length;

/** The whole catalog as it would stand after the paste — what the backup
 *  download and the copy button hand you. An update batch replaces matching
 *  ids in place rather than becoming the entire catalog on its own. */
export function buildFile(
  existing: Recipe[],
  items: ReviewedRecipe[],
  mode: PasteMode,
): Recipe[] {
  const incoming = items
    .map((item) => item.recipe)
    .filter((recipe): recipe is Recipe => recipe !== null);

  if (mode === "append") return [...existing, ...incoming];

  const byId = new Map(incoming.map((recipe) => [recipe.id, recipe]));
  const updated = existing.map((recipe) => byId.get(recipe.id) ?? recipe);
  const existingIds = new Set(existing.map((recipe) => recipe.id));

  return [...updated, ...incoming.filter((recipe) => !existingIds.has(recipe.id))];
}
