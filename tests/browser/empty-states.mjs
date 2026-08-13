import { BASE, launch, ok } from './_harness.mjs';
const b=await launch();

// 1. empty database
let page=await b.newPage({viewport:{width:390,height:900}});
await page.route('**/api/recipes*', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({recipes:[]})}));
await page.goto(BASE+'/');
await page.waitForSelector('text=The drawer is empty');
ok('empty catalog explains itself', true);
ok('offers a way forward', await page.getByRole('link',{name:/Add the first recipe/}).count()===1);
ok('no stale "nothing matches"', !(await page.textContent('body')).includes('matches that search'));
await page.screenshot({path: 'tests/browser/screenshots/empty.png'});
await page.getByRole('link',{name:/Add the first recipe/}).click();
await page.waitForURL(/add-recipe/);
ok('the button goes to the builder', true);
ok('no recipes.json anywhere in the copy', !(await page.textContent('body')).includes('public/data/recipes.json'));
await page.close();

// 2. database unreachable is still an error, not an empty drawer
page=await b.newPage({viewport:{width:390,height:900}});
await page.route('**/api/recipes*', r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'No database is connected to this deployment.'})}));
await page.goto(BASE+'/');
await page.waitForTimeout(900);
const body=await page.textContent('body');
ok('a broken backend reads as an error', body.includes("Couldn't load the recipe drawer"), body.slice(0,120));
await page.close();

// 3. the shipped file really is gone
const res=await (await b.newPage()).goto(BASE+'/data/recipes.json');
ok(`/data/recipes.json no longer served (${res.status()})`, res.status()!==200 || !(await res.text()).trim().startsWith('['));

console.log('done');
await b.close();
