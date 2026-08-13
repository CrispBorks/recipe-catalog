# Card Catalog

A minimal recipe catalog: search your recipes, tap into any card, and send
ingredients straight to your shopping list — with a one-tap path into the iOS
**Reminders** app. No backend, no account.

![React](https://img.shields.io/badge/react-19-1a1a17) ![Vite](https://img.shields.io/badge/vite-6-1a1a17) ![No backend](https://img.shields.io/badge/backend-none-2c5228)

## Features

- **Search** — filter live by title, ingredient, or tag, or hit <kbd>⌘K</kbd>
  to search from anywhere.
- **Tag filters** — combine chips (`vegan` + `quick`) to narrow the drawer, and
  sort by time or alphabetically.
- **Recipe pages** — every recipe is a real page with its own URL, so it can be
  shared, bookmarked, and opened from the phone's back button.
- **Servings scaler** — scale a recipe up or down and every quantity
  recalculates, rendered as proper fractions (`1½ cup`).
- **Cook mode** — tick off steps as you go, and keep the screen awake while
  your hands are busy.
- **Shopping list** — add all or just the ingredients you're missing; equal
  ingredients merge and add up their quantities automatically. Destructive
  edits are undoable.
- **iOS Reminders integration** — send your list through the native Share
  Sheet. Works immediately as a single reminder; an iOS Shortcut can split it
  into one reminder per item.
- **Persistent list** — saved in `localStorage`, so it survives a refresh,
  a closed tab, or another tab editing it.
- **Light and dark** — follows the system by default, with a manual override.

## Design

The interface is monochrome by design: warm-grey card stock, ink, and the
index-card motif (punch hole, ruled ingredient lines, mono small-caps labels).
Color is reserved for *status* — what's already in your list, what you've
ticked off, and destructive actions. Recipe tags stay neutral so the one hue on
screen always means something.

The whole palette lives in `src/index.css` as design tokens mapped onto
shadcn's semantic names, so the look can be changed in one file.

## Project structure

```
recipe-catalog/
├── index.html               # Vite entry
├── api/import.ts            # serverless: reads a recipe off a URL (no API key)
├── api/recipes.ts           # serverless: recipes saved from the app (Postgres)
├── src/
│   ├── App.tsx              # routes (incl. redirects for pre-rewrite URLs)
│   ├── index.css            # design tokens, light + dark
│   ├── components/ui/       # shadcn components (owned, edit freely)
│   ├── hooks/
│   ├── lib/                 # recipe helpers + the shopping-list store
│   └── pages/
└── tests/                   # unit tests, and browser suites in tests/browser
```

## Running locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts: `npm run build` (typechecks, then builds to `dist/`),
`npm run preview` (serve the production build), `npm run typecheck`.

## Tests

```bash
npm test           # unit tests, no browser needed (~0.3s)
npm run test:browser   # builds, serves it, drives a real page
```

`npm test` covers the parsers and the pure helpers — the parts with enough edge
cases to be worth pinning down. Nearly every case in
`tests/parse-recipe-text.test.ts` is a line some recipe site actually publishes;
when the parser trips on a new one, that's where the fix starts.

The browser suites need Chromium once:

```bash
npx playwright install chromium
```

They intercept `/api/*` and serve fixtures, since `vite preview` doesn't run the
serverless functions. Set `CHROMIUM_PATH` to use a Chromium you already have.

## Deploying

The app is a static single-page build, deployed on Vercel. `vercel.json`
rewrites every path except `/api/*` to `index.html` so deep links like
`/recipe/lemon-garlic-roast-chicken` resolve on a hard refresh — any host needs
that same SPA fallback.

Two serverless functions live in `api/`. Neither route is served by `npm run
dev` — use `vercel dev` to exercise them locally, or test on a preview
deployment.

`api/import.ts` fetches a recipe page and reads its schema.org JSON-LD. It
exists only because a browser can't fetch another origin's HTML; there's no
API key or paid service behind it, and it needs no configuration.

`api/recipes.ts` stores recipes saved from the app, in Postgres. It needs two
things set up once, both on free tiers:

1. **A Postgres database.** Vercel dashboard → Storage → Neon (Vercel Postgres
   is Neon now; `@vercel/postgres` is deprecated). Connect it to the project
   and it sets `DATABASE_URL` for you. The `recipes` table is created on first
   use — there's no migration step to run.
2. **`CATALOG_WRITE_KEY`** as an environment variable — any passphrase. Reads
   are public like the rest of the site, but without this anyone who found the
   URL could write to your catalog, so saving refuses to work until it's set.

   The app asks for the key the first time a device tries to change something,
   trades it at `POST /api/session` for a year-long `HttpOnly` cookie, and
   doesn't ask again. A cookie rather than `localStorage` because Safari caps
   anything JavaScript writes at seven days — on iOS that's the difference
   between typing the key once and typing it every week. `/api/recipes` also
   still accepts an `x-catalog-key` header, so the API stays usable from curl.

Skip both and everything else still works; the Save button just reports that
saving isn't configured.

The schema is one table:

```sql
recipes(id text primary key, title text not null, tags jsonb,
        time_minutes integer, servings integer,
        ingredients jsonb, steps jsonb, notes jsonb,
        added_at timestamptz, updated_at timestamptz)
```

Room for what comes next — a pantry, a cook log, photos — is a new table and a
new route, not a change to this one.

**Send to Reminders** relies on `navigator.share`, which requires HTTPS.

## Adding your own recipes

Use the built-in builder at `/add-recipe` — it validates the fields, checks the
slug isn't already taken, and saves it to the catalog.

The page is one flow rather than a set of modes. An import panel sits above the
form: paste a recipe's **text**, or a **link** to one, and it's read for you.
The preview shows what was understood, and from there it's either straight into
the catalog or down into the form to be corrected first — which is also where
you start if you're typing one out by hand.

| Source | How reliable |
| --- | --- |
| **Link** | Exact where the site publishes JSON-LD, which most do |
| **Text** | Heuristic — worth a look in the form |
| **Form** | Exact |
| **Paste JSON** (separate tab) | Validated, with per-recipe errors; also where the backup download lives |

**Save to catalog** writes to the database and the recipe shows up straight
away. There's no JSON to generate or commit — that button existed when the
catalog was a file in the repo, and went when the database arrived.

The catalog is whatever is in the database — there are no recipes in the repo.
There used to be ten sample ones in `public/data/recipes.json` that got merged
in at read time; they were demo data, and keeping two sources meant every read
and write had to reason about which one a recipe came from. **Download a
backup** on the builder page is how you take a copy of everything.

A recipe is shaped like this — the same JSON the **Paste JSON** tab accepts:

```json
{
  "id": "unique-slug",
  "title": "Recipe Name",
  "tags": ["dinner", "quick"],
  "time": 30,
  "servings": 4,
  "ingredients": [{ "qty": 2, "unit": "cups", "name": "flour" }],
  "steps": ["Step one.", "Step two."],
  "notes": ["Any YouTube link here gets embedded automatically."]
}
```

Everything except `id` and `title` is optional — a recipe can be nothing but a
note with a link. Use `"qty": 1, "unit": ""` for whole items like "1 onion", and
leave `qty` empty for "salt to taste".

## License

MIT — see [LICENSE](LICENSE).
