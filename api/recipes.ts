/** /api/recipes — the recipes added from the app, in Postgres.
 *
 *  The ten recipes that ship with the build still live in
 *  public/data/recipes.json; this holds only what's been added since, and the
 *  client merges the two. Keeping them separate means the file in git stays
 *  meaningful and nothing has to be migrated into the database to get started.
 *
 *  GET    → { recipes }        every stored recipe, oldest first
 *  POST   → { recipe }         add or replace one, by id
 *  DELETE → ?id=…              remove one
 *
 *  Writes need the key in CATALOG_WRITE_KEY; without it this would be a public
 *  write endpoint on a public URL. Reads are open, like the rest of the site. */

import { neon } from "@neondatabase/serverless";

// The .js extension is deliberate and load-bearing: the build compiles both
// files to .js and the package is "type": "module", where an extensionless
// specifier does not resolve at runtime. tsc and Vite both map it back to the
// .ts source.
import type { Ingredient, Recipe } from "../src/lib/recipes.js";
import { COOKIE_NAME, readCookie, tokenMatches } from "./session.js";

/** What the table adds on top of a Recipe. */
type Stored = Recipe & { addedAt?: string };

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

/** Vercel's Neon integration sets DATABASE_URL by default, but the connection
 *  dialog offers a custom prefix, and a project carried over from the old
 *  Vercel Postgres has POSTGRES_URL. Rather than depend on one spelling, take
 *  the first that looks like a Postgres connection string. */
const CONNECTION_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "STORAGE_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
];

const isPostgresUrl = (value: string | undefined) =>
  typeof value === "string" && /^postgres(ql)?:\/\//i.test(value);

function findConnectionString(): string {
  for (const name of CONNECTION_VARS) {
    if (isPostgresUrl(process.env[name])) return process.env[name] as string;
  }
  // A custom prefix produces something like MYPREFIX_URL, so fall back to any
  // variable at all whose value is a Postgres URL.
  for (const [name, value] of Object.entries(process.env)) {
    if (name.endsWith("_URL") && isPostgresUrl(value)) return value as string;
  }
  return "";
}

const connectionString = findConnectionString();

/** Created on first use rather than through a migration tool. There is one
 *  table and it is additive-only, so a migration step would be more machinery
 *  than the thing it manages. The promise is memoised, so the round trip
 *  happens once per cold start rather than once per request.
 *
 *  "time" is a type name in SQL and would need quoting everywhere, hence
 *  time_minutes — which is what the column holds anyway. */
let schemaReady: Promise<void> | null = null;

type Sql = ReturnType<typeof neon<false, false>>;

function ensureSchema(sql: Sql): Promise<void> {
  schemaReady ??= (async () => {
    await sql`
      create table if not exists recipes (
        id           text primary key,
        title        text not null,
        tags         jsonb       not null default '[]'::jsonb,
        time_minutes integer,
        servings     integer,
        ingredients  jsonb       not null default '[]'::jsonb,
        steps        jsonb       not null default '[]'::jsonb,
        notes        jsonb       not null default '[]'::jsonb,
        added_at     timestamptz not null default now(),
        updated_at   timestamptz not null default now()
      )
    `;
  })();
  return schemaReady;
}

type Row = {
  id: string;
  title: string;
  tags: string[] | null;
  time_minutes: number | null;
  servings: number | null;
  ingredients: Ingredient[] | null;
  steps: string[] | null;
  notes: string[] | null;
  added_at: Date | string;
};

/** Empty arrays and nulls are dropped rather than sent as [] — the Recipe type
 *  treats every field but id and title as optional, and the rest of the app
 *  tests for presence. */
function toRecipe(row: Row): Stored {
  const recipe: Stored = { id: row.id, title: row.title };
  if (row.tags?.length) recipe.tags = row.tags;
  if (row.time_minutes !== null) recipe.time = row.time_minutes;
  if (row.servings !== null) recipe.servings = row.servings;
  if (row.ingredients?.length) recipe.ingredients = row.ingredients;
  if (row.steps?.length) recipe.steps = row.steps;
  if (row.notes?.length) recipe.notes = row.notes;
  recipe.addedAt = new Date(row.added_at).toISOString();
  return recipe;
}

/** Enough validation that a malformed request can't corrupt the table. The
 *  builder form already checks the same things; this is the backstop for
 *  anything that arrives another way. */
function validate(value: unknown): { recipe: Recipe } | { error: string } {
  if (!value || typeof value !== "object") return { error: "No recipe given." };
  const recipe = value as Partial<Recipe>;

  if (typeof recipe.id !== "string" || !/^[a-z0-9-]{1,120}$/.test(recipe.id)) {
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

const numberOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;

const arrayOrEmpty = (value: unknown) => JSON.stringify(Array.isArray(value) ? value : []);

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");

  if (!connectionString) {
    // Listing the names (never the values) turns "it doesn't work" into an
    // answer: either the integration isn't connected, or it named the variable
    // something this doesn't recognise.
    const candidates = Object.keys(process.env)
      .filter((name) => /url|postgres|database|neon/i.test(name))
      .sort();
    res.status(503).json({
      error: "No database is connected to this deployment.",
      lookedFor: CONNECTION_VARS,
      environmentVariablesPresent: candidates,
    });
    return;
  }

  const sql = neon(connectionString);
  const method = req.method ?? "GET";

  try {
    await ensureSchema(sql);
  } catch (error) {
    // A failed bootstrap must not be cached as success for the life of the
    // instance, or every later request reports a missing table instead.
    schemaReady = null;
    res.status(500).json({
      error: `Couldn't reach the database: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  try {
    if (method === "GET" || method === "HEAD") {
      const rows = (await sql`
        select * from recipes order by added_at asc
      `) as Row[];
      res.status(200).json({ recipes: rows.map(toRecipe) });
      return;
    }

    const expected = process.env.CATALOG_WRITE_KEY;
    if (!expected) {
      res.status(503).json({
        error: "Saving isn't set up on this deployment — CATALOG_WRITE_KEY isn't set.",
      });
      return;
    }
    // The cookie is the ordinary path — set once by /api/session and attached
    // by the browser thereafter. The header stays supported so the API is still
    // usable from a script or curl without a session.
    const header = req.headers["x-catalog-key"];
    const sent = Array.isArray(header) ? header[0] : header;
    const token = readCookie(req.headers.cookie, COOKIE_NAME);

    if (sent !== expected && !(token !== "" && tokenMatches(token, expected))) {
      res.status(401).json({ error: "Wrong key." });
      return;
    }

    if (method === "POST") {
      const checked = validate(req.body ?? null);
      if ("error" in checked) {
        res.status(400).json({ error: checked.error });
        return;
      }
      const recipe = checked.recipe;

      // Saving the same id again replaces it, which is what editing a recipe
      // and saving it back should do. added_at is left alone on update so a
      // recipe doesn't jump to the end of the catalog when it's corrected.
      const rows = (await sql`
        insert into recipes
          (id, title, tags, time_minutes, servings, ingredients, steps, notes)
        values (
          ${recipe.id},
          ${recipe.title.trim()},
          ${arrayOrEmpty(recipe.tags)}::jsonb,
          ${numberOrNull(recipe.time)},
          ${numberOrNull(recipe.servings)},
          ${arrayOrEmpty(recipe.ingredients)}::jsonb,
          ${arrayOrEmpty(recipe.steps)}::jsonb,
          ${arrayOrEmpty(recipe.notes)}::jsonb
        )
        on conflict (id) do update set
          title        = excluded.title,
          tags         = excluded.tags,
          time_minutes = excluded.time_minutes,
          servings     = excluded.servings,
          ingredients  = excluded.ingredients,
          steps        = excluded.steps,
          notes        = excluded.notes,
          updated_at   = now()
        returning *
      `) as Row[];

      res.status(200).json({ recipe: toRecipe(rows[0]), saved: recipe.id });
      return;
    }

    if (method === "DELETE") {
      const raw = req.query.id;
      const id = Array.isArray(raw) ? raw[0] : raw;
      if (!id) {
        res.status(400).json({ error: "No id given." });
        return;
      }

      const rows = (await sql`
        delete from recipes where id = ${id} returning id
      `) as { id: string }[];
      if (rows.length === 0) {
        res.status(404).json({ error: `No stored recipe with the id "${id}".` });
        return;
      }

      res.status(200).json({ deleted: id });
      return;
    }

    res.status(405).json({ error: "Use GET, POST or DELETE." });
  } catch (error) {
    res.status(500).json({
      error: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
