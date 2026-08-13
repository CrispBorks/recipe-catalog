import { BASE, launch, ok } from './_harness.mjs';
// The catalog now comes from the database, so the suite serves the ten
// recipes that used to ship with the build as a fixture.
import { readFileSync } from 'node:fs';
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/recipes.json', import.meta.url),'utf8'));

const b = await launch();
const page = await b.newPage({ viewport: { width: 390, height: 1000 } });
const posted = [];
await page.route('**/api/recipes*', r => {
  if (r.request().method() === 'POST') {
    posted.push(JSON.parse(r.request().postData()));
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({saved:posted.at(-1).id})});
  }
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({recipes:FIXTURE})});
});
await page.route('**/api/session', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})}));
const errors = [];
page.on('pageerror', e => errors.push(e.message));

const RECIPE = `Garlic Butter Shrimp

Prep Time: 10 mins
Cook Time: 12 mins
Serves 3
Tags: dinner, seafood, quick

Ingredients
1 lb large shrimp, peeled
4 tbsp butter
5 cloves garlic, minced
1/2 tsp red pepper flakes
2 tbsp parsley

Instructions
1. Melt the butter in a wide skillet over medium heat.
2. Add the garlic and pepper flakes and cook 30 seconds.
3. Add the shrimp and cook 3 minutes per side.

Notes
Serve over rice or with crusty bread.
https://youtu.be/dQw4w9WgXcQ`;

await page.goto(BASE + '/add-recipe');
await page.waitForSelector('form');

// the import panel sits above the form rather than replacing it
ok('paste area is on the page', await page.getByLabel('Recipe text').count() === 1);
ok('the form is there too', await page.locator('form').count() === 1);
ok('no actions offered while empty', await page.getByRole('button', { name: /Review in the form/ }).count() === 0);

await page.getByLabel('Recipe text').fill(RECIPE);
await page.waitForTimeout(400);
const summary = await page.textContent('body');
ok('summary reports what was found', /title · 22 min · serves 3 · 5 ingredients · 3 steps · 2 notes · 3 tags/.test(summary.replace(/\s+/g, ' ')),
   (summary.match(/title[^\n]{0,90}/) || [''])[0]);
ok('preview lists the parsed title', summary.includes('Garlic Butter Shrimp'));
ok('preview shows an ingredient with qty+unit', summary.includes('large shrimp, peeled'));
await page.screenshot({ path: 'tests/browser/screenshots/pt-preview.png' });

// push it into the form
await page.getByRole('button', { name: /Review in the form/ }).click();
await page.waitForTimeout(500);
ok('the form is filled in below', await page.locator('form').count() === 1);

const val = async (name) => page.getByRole('textbox', { name, exact: true }).inputValue();
ok(`title filled (${await page.getByLabel('Title').inputValue()})`, await page.getByLabel('Title').inputValue() === 'Garlic Butter Shrimp');
ok(`slug derived (${await page.getByLabel('ID (slug)').inputValue()})`, await page.getByLabel('ID (slug)').inputValue() === 'garlic-butter-shrimp');
ok(`time filled (${await page.getByLabel('Time (minutes)').inputValue()})`, await page.getByLabel('Time (minutes)').inputValue() === '22');
ok(`servings filled (${await page.getByLabel('Servings').inputValue()})`, await page.getByLabel('Servings').inputValue() === '3');

ok('5 ingredient rows', await page.getByRole('textbox', { name: /^Ingredient \d+$/ }).count() === 5);
ok(`ingredient 1 qty/unit/name`,
   await val('Quantity 1') === '1' && await val('Unit 1') === 'lb' && await val('Ingredient 1') === 'large shrimp, peeled');
ok(`ingredient 4 fraction converted (${await val('Quantity 4')})`, await val('Quantity 4') === '0.5' && await val('Unit 4') === 'tsp');
ok('3 step rows with numbers stripped',
   await page.getByRole('textbox', { name: /^Step \d+$/ }).count() === 3 &&
   (await val('Step 1')).startsWith('Melt the butter'));
ok('2 note rows', await page.getByRole('textbox', { name: /^Note \d+$/ }).count() === 2);
ok('youtube link kept in notes', (await val('Note 2')).includes('youtu.be'));

// tags came across and are selected
const tagPressed = await page.getByRole('button', { name: 'seafood', exact: true }).getAttribute('aria-pressed');
ok('parsed tags are pre-selected', tagPressed === 'true');

// and it saves correctly end to end
await page.getByRole('button', { name: /Save to catalog/ }).last().click();
await page.waitForSelector('text=Saved to the catalog');
const recipe = posted.at(-1);
ok('saved recipe is complete',
   recipe.id === 'garlic-butter-shrimp' && recipe.time === 22 && recipe.servings === 3 &&
   recipe.ingredients.length === 5 && recipe.steps.length === 3 && recipe.notes.length === 2,
   JSON.stringify(recipe).slice(0, 160));
ok('numeric qty is a number, not a string', typeof recipe.ingredients[0].qty === 'number');
ok('tags carried through', JSON.stringify(recipe.tags) === '["dinner","seafood","quick"]', JSON.stringify(recipe.tags));
await page.screenshot({ path: 'tests/browser/screenshots/pt-form.png' });

// unstructured text still works, with the caveat shown
await page.getByLabel('Recipe text').fill(`Quick Cucumber Salad
2 cucumbers
1 tbsp rice vinegar
Slice the cucumbers thinly.
Toss with the vinegar and chill.`);
await page.waitForTimeout(400);
const t2 = await page.textContent('body');
ok('unstructured text still parses', t2.includes('2 ingredients') && t2.includes('2 steps'));
ok('guess caveat is shown when there are no headings', t2.includes('is a guess'));

console.log('\nerrors:', errors.length ? errors : 'none');
await b.close();
