# Card Catalog

A minimal, static recipe catalog: search your recipes, tap into any card, and
send ingredients straight to your shopping list — with a one-tap path into the
iOS **Reminders** app. No backend, no build step, no account.

![No framework](https://img.shields.io/badge/framework-none-5b3358) ![No backend](https://img.shields.io/badge/backend-none-55705b)

## Features

- **Search** — filter recipes live by title, ingredient, or tag.
- **Tag filters** — quick chips for things like `dinner`, `vegan`, `quick`.
- **Recipe cards** — tap a card to see ingredients, method, time, and servings.
- **Shopping list** — add all or just the ingredients you're missing; equal
  ingredients merge and add up their quantities automatically.
- **iOS Reminders integration** — send your list through the native Share
  Sheet. Works immediately as a single reminder, or set up a 60-second
  Shortcut (guide included) for one reminder per item. See
  [`shortcuts/README.md`](shortcuts/README.md).
- **Persistent list** — your shopping list is saved in `localStorage`, so it
  survives a refresh or closing the tab.
- **No dependencies** — vanilla HTML/CSS/JS. Works on GitHub Pages out of the box.

## Project structure

```
recipe-catalog/
├── index.html            # app shell
├── css/style.css          # styling
├── js/app.js               # search, list, and Reminders logic
├── data/recipes.json      # recipe data — edit or extend this
└── shortcuts/README.md    # iOS Reminders / Shortcuts setup guide
```

## Running locally

Any static file server works, for example:

```bash
cd recipe-catalog
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly with `file://` will not work, since the app
fetches `data/recipes.json`.)

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick your
   default branch and the `/ (root)` folder.
4. Save — GitHub will publish the site at
   `https://<your-username>.github.io/<repo-name>/`.

The **Send to Reminders** button relies on `navigator.share`, which requires
HTTPS — GitHub Pages serves over HTTPS by default, so this works there without
any extra configuration.

## Adding your own recipes

Edit `data/recipes.json`. Each recipe looks like:

```json
{
  "id": "unique-slug",
  "title": "Recipe Name",
  "tags": ["dinner", "quick"],
  "time": 30,
  "servings": 4,
  "ingredients": [
    { "qty": 2, "unit": "cups", "name": "flour" }
  ],
  "steps": ["Step one.", "Step two."]
}
```

Use `"qty": 1, "unit": ""` for whole items like "1 onion" — the app will just
render the count.

## License

MIT — see [LICENSE](LICENSE).
