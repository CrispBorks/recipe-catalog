import { BASE, launch, ok } from './_harness.mjs';
const b=await launch();
const page=await b.newPage({viewport:{width:390,height:1000}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));

const KEY='letmein';
let store=[];
let posts=0;
// Writes are refused until /api/session has been given the right key — the
// browser carries the session from there, so nothing sends the key again.
let signedIn=false;
await page.route('**/api/session', route => {
  const body=JSON.parse(route.request().postData()||'{}');
  if (body.key!==KEY) return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Wrong key.'})});
  signedIn=true;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});
});
await page.route('**/api/recipes*', async route => {
  const req=route.request();
  if (req.method()==='GET') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({recipes:store})});
  if (req.method()==='POST') {
    posts++;
    if (!signedIn)
      return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Wrong key.'})});
    const r=JSON.parse(req.postData());
    store=[...store.filter(x=>x.id!==r.id),{...r,addedAt:'2026-08-13T00:00:00Z'}];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({recipes:store,saved:r.id})});
  }
  return route.fulfill({status:405,body:'{}'});
});

await page.goto(BASE+'/add-recipe');
await page.waitForSelector('form');
await page.getByLabel('Title').fill('Store Test Soup');
await page.getByLabel('Time (minutes)').fill('25');
await page.getByRole('textbox',{name:'Ingredient 1',exact:true}).fill('carrots');
await page.getByRole('textbox',{name:'Quantity 1',exact:true}).fill('3');
await page.getByRole('textbox',{name:'Step 1',exact:true}).fill('Chop and simmer.');

ok('Save button present', await page.getByRole('button',{name:/Save to catalog/}).count()===1);
await page.getByRole('button',{name:/Save to catalog/}).click();
await page.waitForTimeout(400);
await page.waitForSelector('#catalog-key');
ok('asks for the key when not signed in', await page.getByLabel('Catalog key').count()===1);
ok('the key is only asked for after a refused save', posts===1, posts);

// wrong key first
await page.getByLabel('Catalog key').fill('nope');
await page.getByRole('button',{name:'Save',exact:true}).click();
await page.waitForSelector('[data-sonner-toast]');
ok('wrong key surfaces the error', (await page.textContent('[data-sonner-toast]')).includes('Wrong key'));
ok('key prompt stays open', await page.getByLabel('Catalog key').count()===1);

await page.getByLabel('Catalog key').fill(KEY);
await page.getByRole('button',{name:'Save',exact:true}).click();
await page.waitForSelector('text=Saved to the catalog');
ok('save confirmed in the UI', true);
ok('one recipe in the store', store.length===1 && store[0].id==='store-test-soup', store);
ok('recipe shape is right', store[0].time===25 && store[0].ingredients[0].qty===3 && store[0].steps.length===1, store[0]);
await page.screenshot({path: 'tests/browser/screenshots/save-done.png'});

// the catalog now merges it in
await page.getByRole('link',{name:/Open the recipe/}).click();
await page.waitForURL(/\/recipe\/store-test-soup/);
await page.waitForSelector('h1');
ok('saved recipe opens', (await page.locator('h1').textContent()).trim()==='Store Test Soup');

await page.goto(BASE+'/');
await page.waitForSelector('a[href^="/recipe/"]');
const count=await page.locator('a[href^="/recipe/"]').count();
ok(`catalog shows exactly what was saved (${count})`, count===1);

// key is remembered across a reload
await page.goto(BASE+'/add-recipe');
await page.waitForSelector('form');
await page.getByLabel('Title').fill('Second Soup');
await page.getByRole('textbox',{name:'Ingredient 1',exact:true}).fill('onion');
await page.getByRole('textbox',{name:'Step 1',exact:true}).fill('Fry.');
await page.getByRole('button',{name:/Save to catalog/}).click();
await page.waitForSelector('text=Saved to the catalog');
ok('session persists — no second prompt', await page.getByLabel('Catalog key').count()===0);
ok('two recipes stored', store.length===2, store.map(r=>r.id));

console.log('\nerrors:',errors.length?errors:'none');
await b.close();
