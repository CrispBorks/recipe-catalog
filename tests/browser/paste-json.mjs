import { BASE, launch, ok } from './_harness.mjs';

const b = await launch();
const page = await b.newPage({ viewport: { width: 390, height: 1600 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

const CATALOG = [
  { id: 'roast-chicken', title: 'Roast Chicken', time: 75 },
  { id: 'tomato-pasta', title: 'Tomato Pasta', time: 25 },
];
const posted = [];

await page.route('**/api/session', r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
await page.route('**/api/recipes*', r => {
  if (r.request().method() === 'POST') {
    posted.push(JSON.parse(r.request().postData()));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ saved: posted.at(-1).id }) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recipes: CATALOG }) });
});

await page.goto(BASE + '/add-recipe');
await page.waitForSelector('form');
await page.getByRole('button', { name: 'Paste JSON' }).click();
await page.waitForTimeout(200);

// There's no export button: GET /api/recipes already returns the whole
// catalog as JSON, so a button would be a shortcut for an address.
ok('no export button competing with the paste flow',
   await page.getByRole('button', { name: /Download|Copy all/ }).count() === 0);

// ---------- a clean paste ----------
await page.getByRole('button', { name: 'Insert example' }).click();
await page.waitForTimeout(400);

ok('the recipe is previewed as a card', await page.getByText('Example Soup').count() >= 1);
// A valid entry used to also get a "Example Soup ✓" row, saying less than the
// card directly beneath it
ok('no per-entry row for a clean entry', await page.locator('li', { hasText: /^Example Soup$/ }).count() === 0);
ok('no entry count for a single entry', !(await page.textContent('body')).includes('1 entr'));

await page.getByRole('button', { name: /Save 1 to the catalog/ }).click();
await page.waitForTimeout(500);
ok('saving posts the pasted recipe', posted.length === 1 && posted[0].id === 'example-soup', posted);
ok('the whole recipe is sent', posted[0].time === 30 && posted[0].ingredients.length === 2, posted[0]);

// ---------- a paste with problems ----------
const before = posted.length;
await page.getByLabel('Recipe JSON').fill(
  '[{"id":"ok-one","title":"Fine","steps":["Go."]},{"title":"No id here"},{"id":"roast-chicken","title":"Clashes"}]',
);
await page.waitForTimeout(400);

const body = await page.textContent('body');
ok('counts what needs fixing', /3 entries/.test(body) && /2 to fix/.test(body), (body.match(/\d+ entries[^\n]{0,40}/) || [''])[0]);
ok('a missing id is named', body.includes('Missing `id`'));
ok('a clashing slug is named', body.includes('already exists in the catalog'));
ok('the valid entry is still previewed', body.includes('Fine'));

const save = page.getByRole('button', { name: /Save 1 to the catalog/ });
ok('saving is blocked while an entry is broken', await save.isDisabled());
await page.waitForTimeout(200);
ok('nothing was sent', posted.length === before, posted.length - before);
await page.screenshot({ path: 'tests/browser/screenshots/paste-json.png', fullPage: true });

// ---------- update mode allows an existing id ----------
await page.getByRole('button', { name: 'Update existing' }).click();
await page.waitForTimeout(400);
ok('an existing id is fine when updating',
   !(await page.textContent('body')).includes('already exists in the catalog'));

// ---------- malformed JSON ----------
await page.getByLabel('Recipe JSON').fill('[{"id": "broken",]');
await page.waitForTimeout(400);
const broken = await page.textContent('body');
ok('malformed JSON is reported', broken.includes("That isn't valid JSON"));
ok('with a position to look at', /Line \d+, column \d+/.test(broken), (broken.match(/Line[^\n]{0,30}/) || [''])[0]);

console.log('\nerrors:', errors.length ? errors : 'none');
await b.close();
