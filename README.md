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
  Sheet. Works immediately as a single reminder, or set up a 60-second
  Shortcut (guide included) for one reminder per item. See
  [`shortcuts/README.md`](shortcuts/README.md).
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
├── public/data/recipes.json # recipe data — edit or extend this
├── src/
│   ├── App.tsx              # routes (incl. redirects for pre-rewrite URLs)
│   ├── index.css            # design tokens, light + dark
│   ├── components/ui/       # shadcn components (owned, edit freely)
│   ├── hooks/
│   ├── lib/                 # recipe helpers + the shopping-list store
│   └── pages/
└── shortcuts/README.md      # iOS Reminders / Shortcuts setup guide
```

## Running locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts: `npm run build` (typechecks, then builds to `dist/`),
`npm run preview` (serve the production build), `npm run typecheck`.

## Deploying

The app is a static single-page build, deployed on Vercel. `vercel.json`
rewrites every path except `/api/*` to `index.html` so deep links like
`/recipe/lemon-garlic-roast-chicken` resolve on a hard refresh — any host needs
that same SPA fallback.

The one server-side piece is `api/import.ts`, which fetches a recipe page and
reads its schema.org JSON-LD. It exists only because a browser can't fetch
another origin's HTML; there's no API key or paid service behind it. Under
`npm run dev` that route isn't served — use `vercel dev` to exercise it
locally, or just test it on a preview deployment.

**Send to Reminders** relies on `navigator.share`, which requires HTTPS.

## Adding your own recipes

Use the built-in builder at `/add-recipe` — it validates the fields, checks the
slug isn't already taken, and hands back the JSON block (or the whole updated
file) to drop into `public/data/recipes.json`. Four ways in:

| Tab | What it takes | How reliable |
| --- | --- | --- |
| **Form** | Typed by hand | Exact |
| **Link** | A recipe page URL | Exact where the site publishes JSON-LD, which most do |
| **Paste text** | A wall of recipe text | Heuristic — always check it in the form |
| **Paste JSON** | One or more recipes already in this format | Validated, with per-recipe errors |

All of them land in the form, so nothing is saved without a look first.

To write one by hand:

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
