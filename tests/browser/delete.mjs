import { BASE, launch, ok } from './_harness.mjs';
const b=await launch();
const page=await b.newPage({viewport:{width:390,height:1000}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const KEY='letmein';
let store=[{id:'test-soup',title:'Test Soup',time:20,ingredients:[{qty:2,unit:'cups',name:'stock'}],steps:['Simmer.']},
           {id:'other',title:'Other Thing',time:5,steps:['Wait.']}];
let deletes=0;

let signedIn=false;
await page.route('**/api/session', r=>{
  const body=JSON.parse(r.request().postData()||'{}');
  if(body.key!==KEY) return r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Wrong key.'})});
  signedIn=true;
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});
});
await page.route('**/api/recipes*', async r=>{
  const req=r.request();
  if(req.method()==='GET') return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({recipes:store})});
  if(req.method()==='DELETE'){
    deletes++;
    if(!signedIn) return r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Wrong key.'})});
    const id=new URL(req.url()).searchParams.get('id');
    store=store.filter(x=>x.id!==id);
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({deleted:id})});
  }
  return r.fulfill({status:405,body:'{}'});
});

await page.goto(BASE+'/recipe/test-soup');
await page.waitForSelector('h1');
ok('danger zone exists', await page.getByText('Danger zone').count()===1);
const del=page.getByRole('button',{name:/Delete recipe/});
ok('delete button present', await del.count()===1);

// it is the last thing on the page, below the method
const dangerY=(await del.boundingBox()).y;
const h1Y=(await page.locator('h1').boundingBox()).y;
ok('sits at the very bottom, below everything', dangerY > h1Y + 400, {dangerY,h1Y});
const cls=await del.getAttribute('class');
ok('rendered as a destructive button', /destructive/.test(cls), cls);
await page.screenshot({path: 'tests/browser/screenshots/danger.png',fullPage:true});

// confirmation is required
await del.click();
await page.waitForSelector('[role="alertdialog"]');
ok('asks for confirmation', (await page.textContent('[role="alertdialog"]')).includes('Test Soup'));
ok('nothing deleted yet', deletes===0);
await page.getByRole('button',{name:'Keep it'}).click();
await page.waitForTimeout(250);
ok('cancelling deletes nothing', deletes===0 && store.length===2);

// not signed in: the first confirmed delete asks for the key rather than failing
await page.getByRole('button',{name:/Delete recipe/}).click();
await page.waitForSelector('[role="alertdialog"]');
await page.getByRole('button',{name:'Delete it'}).click();
await page.waitForSelector('#catalog-key');
ok('asks for the key instead of reporting an error', await page.getByLabel('Catalog key').count()===1);
ok('still on the recipe', page.url().includes('/recipe/test-soup'));

// a wrong key is reported, and the prompt stays put
await page.getByLabel('Catalog key').fill('nope');
await page.locator('[role="alertdialog"]').waitFor({state:'detached'});
await page.getByRole('button',{name:'Delete',exact:true}).click();
await page.waitForSelector('[data-sonner-toast]');
ok('wrong key is reported', (await page.textContent('[data-sonner-toast]')).includes('Wrong key'));
ok('the prompt stays open', await page.getByLabel('Catalog key').count()===1);
const exactDelete = await page.getByRole('button',{name:'Delete',exact:true}).count();
const anySave = await page.getByRole('button',{name:'Save',exact:true}).count();
ok('the prompt says Delete, not Save', exactDelete>=1 && anySave===0, {exactDelete,anySave});
ok('nothing was removed', store.length===2, store.map(r=>r.id));

// correct key
await page.getByLabel('Catalog key').fill(KEY);
await page.getByRole('button',{name:'Delete',exact:true}).click();
await page.waitForURL(u=>!u.pathname.includes('/recipe/'),{timeout:5000});
ok('returns to the catalog', true);
ok('recipe gone from the store', store.length===1 && store[0].id==='other', store.map(r=>r.id));
await page.waitForTimeout(700);
// the success toast quotes the title, so check the cards rather than the page text
ok('catalog no longer lists it', await page.locator('a[href="/recipe/test-soup"]').count()===0);
ok('the other recipe is still there', await page.locator('a[href="/recipe/other"]').count()===1);

console.log('\nerrors:',errors.length?errors:'none');
await b.close();
