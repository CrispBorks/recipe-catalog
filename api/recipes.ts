/** /api/recipes — the recipes added from the app, kept in a Vercel Blob store.
 *
 *  The ten recipes that ship with the build still live in
 *  public/data/recipes.json; this holds only what's been added since, and the
 *  client merges the two. Keeping them separate means the file in git stays
 *  meaningful and nothing has to be migrated into the store to get started.
 *
 *  GET    → { recipes }        the stored recipes
 *  POST   → { recipe }         add or replace one, by id
 *  DELETE → ?id=…              remove one
 *
 *  Writes need the key in CATALOG_WRITE_KEY; without it this would be a public
 *  write endpoint on a public URL. Reads are open, like the rest of the site. */

import { get, put } from "@vercel/blob";

const PATHNAME = "catalog/recipes.json";
const KEY_HEADER = "x-catalog-key";

type Ingredient = { qty: number | string; unit: string; name: string };
type Recipe = {
  id: string;
  title: string;
  tags?: string[];
  time?: number;
  servings?: number;
  ingredients?: Ingredient[];
  steps?: string[];
  notes?: string[];
  /** When it was added, so the catalog can show newest first. */
  addedAt?: string;
};

type Req = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

async function readAll(): Promise<Recipe[]> {
  // useCache: false, because the CDN caches blobs for a minute at minimum and
  // a recipe you just saved has to be there when the page reloads.
  const result = await get(PATHNAME, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return [];

  const text = await new Response(result.stream).text();
  const parsed: unknown = JSON.parse(text);
  return Array.isArray(parsed) ? (parsed as Recipe[]) : [];
}

async function writeAll(recipes: Recipe[]): Promise<void> {
  await put(PATHNAME, JSON.stringify(recipes, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

/** Enough validation that a malformed request can't corrupt the store. The
 *  builder form already checks the same things; this is the backstop for
 *  anything that arrives another way. */
function validate(value: unknown): { recipe: Recipe } | { error: string } {
  if (!value || typeof value !== "object") return { error: "No recipe given." };
  const recipe = value as Partial<Recipe>;

  if (typeof recipe.id !== "string" || !/^[a-z0-9-]+$/.test(recipe.id)) {
    return { error: "A recipe needs an id of lowercase letters, numbers and dashes." };
  }
  if (typeof recipe.title !== "string" || recipe.title.trim() === "") {
    return { error: "A recipe needs a title." };
  }
  if (JSON.stringify(recipe).length > 100_000) {
    return { error: "That recipe is implausibly large." };
  }
  return { recipe: recipe as Recipe };
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");

  const method = req.method ?? "GET";

  let stored: Recipe[];
  try {
    stored = await readAll();
  } catch (error) {
    res.status(500).json({
      error: `Couldn't read the recipe store: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  if (method === "GET" || method === "HEAD") {
    res.status(200).json({ recipes: stored });
    return;
  }

  const expected = process.env.CATALOG_WRITE_KEY;
  if (!expected) {
    res.status(503).json({
      error: "Saving isn't set up on this deployment — CATALOG_WRITE_KEY isn't set.",
    });
    return;
  }
  const provided = req.headers[KEY_HEADER];
  if ((Array.isArray(provided) ? provided[0] : provided) !== expected) {
    res.status(401).json({ error: "Wrong key." });
    return;
  }

  if (method === "POST") {
    const checked = validate(req.body ?? null);
    if ("error" in checked) {
      res.status(400).json({ error: checked.error });
      return;
    }

    const recipe: Recipe = {
      ...checked.recipe,
      addedAt: checked.recipe.addedAt ?? new Date().toISOString(),
    };
    // Saving the same id again replaces it, which is what editing a recipe and
    // saving it back should do.
    const next = [...stored.filter((r) => r.id !== recipe.id), recipe];

    try {
      await writeAll(next);
    } catch (error) {
      res.status(500).json({
        error: `Couldn't save: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    res.status(200).json({ recipes: next, saved: recipe.id });
    return;
  }

  if (method === "DELETE") {
    const raw = req.query.id;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (!id) {
      res.status(400).json({ error: "No id given." });
      return;
    }

    const next = stored.filter((r) => r.id !== id);
    if (next.length === stored.length) {
      res.status(404).json({ error: `No stored recipe with the id "${id}".` });
      return;
    }

    try {
      await writeAll(next);
    } catch (error) {
      res.status(500).json({
        error: `Couldn't delete: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    res.status(200).json({ recipes: next, deleted: id });
    return;
  }

  res.status(405).json({ error: "Use GET, POST or DELETE." });
}
