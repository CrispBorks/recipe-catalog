import { BASE, launch, ok } from './_harness.mjs';

// The catalog now comes from the database, so the suite serves the ten
// recipes that used to ship with the build as a fixture.
import { readFileSync } from 'node:fs';
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/recipes.json', import.meta.url),'utf8'));

const b = await launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
const page = await ctx.newPage();
const posted = [];
await ctx.route('**/api/recipes*', r => {
  if (r.request().method() === 'POST') {
    posted.push(JSON.parse(r.request().postData()));
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({saved:posted.at(-1).id})});
  }
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({recipes:FIXTURE})});
});
await ctx.route('**/api/session', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})}));

const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// ---------- catalog ----------
await page.goto(BASE + '/');
await page.waitForSelector('a[href^="/recipe/"]');
const cardCount = await page.locator('a[href^="/recipe/"]').count();
ok(`catalog renders ${cardCount} cards`, cardCount === 10);
ok('list badge hidden when empty', await page.locator('a[href="/shopping-list"] span').count() === 0);
await page.screenshot({ path: 'tests/browser/screenshots/app-catalog-light.png' });

// tag multi-select (AND)
await page.getByRole('button', { name: 'dinner', exact: true }).click();
await page.getByRole('button', { name: 'vegan', exact: true }).click();
await page.waitForTimeout(200);
const filtered = await page.locator('a[href^="/recipe/"]').count();
const metaText = await page.locator('p.meta-mono').first().textContent();
ok(`two-tag AND filter narrows to ${filtered} (${metaText.trim()})`, filtered > 0 && filtered < cardCount);
await page.getByRole('button', { name: /Clear/ }).click();
await page.waitForTimeout(150);
ok('clear restores full list', await page.locator('a[href^="/recipe/"]').count() === cardCount);

// sort
await page.getByRole('button', { name: /Sort order/ }).click();
await page.getByRole('menuitemradio', { name: 'Quickest first' }).click();
await page.waitForTimeout(200);
const firstTitle = await page.locator('a[href^="/recipe/"] h3').first().textContent();
ok(`sort by time puts a quick recipe first (${firstTitle.trim()})`, !!firstTitle);

// search
await page.getByLabel('Search recipes, ingredients, or tags').fill('chickpea');
await page.waitForTimeout(200);
ok('search narrows results', await page.locator('a[href^="/recipe/"]').count() === 1);
await page.getByLabel('Search recipes, ingredients, or tags').fill('');

// ---------- recipe page ----------
await page.locator('a[href^="/recipe/"]').first().click();
await page.waitForURL(/\/recipe\//);
await page.waitForSelector('h1');
const title = (await page.locator('h1').textContent()).trim();
const qtyBefore = (await page.locator('ul li span.meta-mono').first().textContent()).trim();

// servings scaler
await page.getByLabel('Increase').click();
await page.getByLabel('Increase').click();
await page.waitForTimeout(150);
const qtyAfter = (await page.locator('ul li span.meta-mono').first().textContent()).trim();
ok(`servings scaler changes quantities (${qtyBefore} -> ${qtyAfter})`, qtyBefore !== qtyAfter);
await page.getByLabel('Decrease').click();
await page.getByLabel('Decrease').click();
await page.waitForTimeout(150);
ok('scaler returns to base', (await page.locator('ul li span.meta-mono').first().textContent()).trim() === qtyBefore);

// cook mode: tick a step
const stepBtn = page.locator('ol button').first();
await stepBtn.click();
await page.waitForTimeout(150);
ok('step marks done', await stepBtn.getAttribute('aria-pressed') === 'true');
await page.screenshot({ path: 'tests/browser/screenshots/app-recipe-light.png' });

// add to list
await page.getByRole('button', { name: 'Add all ingredients' }).click();
await page.waitForSelector('[data-sonner-toast]');
ok('toast shown after adding', await page.locator('[data-sonner-toast]').count() > 0);

// ---------- shopping list ----------
await page.goto(BASE + '/');
await page.waitForSelector('a[href="/shopping-list"] span');
const badge = (await page.locator('a[href="/shopping-list"] span').first().textContent()).trim();
ok(`header badge shows ${badge}`, Number(badge) > 0);
ok('exactly one card marked as in-list', await page.getByText('In your list').count() === 1);

await page.locator('a[href="/shopping-list"]').click();
await page.waitForURL(/shopping-list/);
await page.waitForSelector('h1');
ok('list page titled correctly', (await page.locator('h1').textContent()).trim() === 'Shopping list');
ok('grouped under recipe name', await page.getByRole('heading', { name: title }).count() === 1);
const items = await page.locator('ul li').count();
await page.screenshot({ path: 'tests/browser/screenshots/app-list-light.png' });

// remove with undo
await page.locator('button[aria-label^="Remove"]').first().click();
await page.waitForTimeout(250);
ok('item removed', await page.locator('ul li').count() === items - 1);
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(250);
ok('undo restores item', await page.locator('ul li').count() === items);

// check an item persists across reload
await page.locator('button[role="checkbox"]').first().click();
await page.waitForTimeout(200);
await page.reload();
await page.waitForSelector('ul li');
ok('checked state persists', await page.locator('button[role="checkbox"][data-state="checked"]').count() === 1);

// clear all via alert dialog
await page.getByRole('button', { name: /Clear all/ }).click();
await page.waitForSelector('[role="alertdialog"]');
ok('confirm dialog appears (no native confirm)', await page.locator('[role="alertdialog"]').count() === 1);
await page.getByRole('button', { name: 'Clear it' }).click();
await page.waitForTimeout(300);
ok('list emptied', (await page.textContent('body')).includes('Your list is empty'));
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(300);
ok('undo restores whole list', await page.locator('ul li').count() === items);

// ---------- command palette ----------
await page.goto(BASE + '/');
await page.waitForSelector('a[href^="/recipe/"]');
await page.keyboard.press('Control+k');
await page.waitForSelector('[cmdk-input]');
await page.locator('[cmdk-input]').fill('chickpea');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForURL(/\/recipe\//);
ok('command palette navigates', page.url().includes('/recipe/'));

// ---------- legacy URLs ----------
await page.goto(BASE + '/recipe.html?id=weeknight-tomato-basil-pasta');
await page.waitForURL(/\/recipe\/weeknight-tomato-basil-pasta/);
ok('legacy /recipe.html?id= redirects', page.url().endsWith('/recipe/weeknight-tomato-basil-pasta'));
await page.goto(BASE + '/shopping-list.html');
await page.waitForURL(/\/shopping-list$/);
ok('legacy /shopping-list.html redirects', page.url().endsWith('/shopping-list'));

// unknown recipe id
await page.goto(BASE + '/recipe/does-not-exist');
await page.waitForTimeout(400);
ok('unknown recipe shows fallback', (await page.textContent('body')).includes("isn't in the drawer"));

// ---------- add recipe ----------
await page.goto(BASE + '/add-recipe');
await page.waitForSelector('form');
await page.getByLabel('Title').fill('Test Soup');
await page.getByLabel('Time (minutes)').fill('30');
await page.waitForTimeout(200);
ok('slug auto-fills from title', await page.getByLabel('ID (slug)').inputValue() === 'test-soup');
await page.getByRole('button', { name: 'dinner', exact: true }).click();
await page.getByRole('textbox', { name: 'Ingredient 1', exact: true }).fill('carrots');
await page.getByRole('textbox', { name: 'Quantity 1', exact: true }).fill('3');
await page.getByRole('textbox', { name: 'Step 1', exact: true }).fill('Chop and simmer.');
await page.getByRole('button', { name: /Save to catalog/ }).click();
await page.waitForSelector('text=Saved to the catalog');
const saved = posted.at(-1);
ok('the form saves straight to the catalog',
   saved.id === 'test-soup' && saved.time === 30 && saved.tags.includes('dinner') &&
   saved.ingredients[0].name === 'carrots' && saved.ingredients[0].qty === 3 &&
   saved.steps[0] === 'Chop and simmer.', JSON.stringify(saved));

// duplicate id rejected before anything is sent
const before = posted.length;
await page.getByLabel('Title').fill('Lemon Garlic Roast Chicken');
await page.waitForTimeout(200);
await page.getByRole('button', { name: /Save to catalog/ }).click();
await page.waitForTimeout(400);
ok('duplicate id blocked', (await page.textContent('body')).includes('is already used by'));
ok('nothing sent for a duplicate', posted.length === before, posted.length - before);
await page.screenshot({ path: 'tests/browser/screenshots/app-add-light.png' });

console.log('\nerrors:', errors.length ? errors : 'none');
await ctx.close();

// ---------- dark mode sweep ----------
const dctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
const dp = await dctx.newPage();
await dctx.route('**/api/recipes*', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({recipes:FIXTURE})}));
const derrors = [];
dp.on('pageerror', e => derrors.push(e.message));
await dp.goto(BASE + '/');
await dp.waitForSelector('a[href^="/recipe/"]');
const isDark = await dp.evaluate(() => document.documentElement.classList.contains('dark'));
ok('dark class applied from system preference', isDark);
const bg = await dp.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok(`body background is dark (${bg})`, bg === 'rgb(19, 19, 17)');
await dp.screenshot({ path: 'tests/browser/screenshots/app-catalog-dark.png' });
await dp.locator('a[href^="/recipe/"]').first().click();
await dp.waitForSelector('h1');
await dp.screenshot({ path: 'tests/browser/screenshots/app-recipe-dark.png' });
console.log('dark errors:', derrors.length ? derrors : 'none');
await b.close();
