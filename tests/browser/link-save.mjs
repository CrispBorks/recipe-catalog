import { BASE, launch, ok } from './_harness.mjs';
const b=await launch();
const page=await b.newPage({viewport:{width:390,height:1100}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const KEY='letmein'; let store=[];

const RECIPE={title:"Mascarpone Whipped Cream",time:"10",servings:"4",tags:["dessert"],
 ingredients:[{qty:"8",unit:"oz",name:"mascarpone cheese, cold"},{qty:"1.25",unit:"cups",name:"heavy whipping cream, cold"}],
 steps:["Chill the bowl.","Beat until stiff."],notes:["https://example.com/x"],sectioned:true,
 sourceUrl:"https://example.com/x",sourceName:"Julianne"};

await page.route('**/api/import*', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(RECIPE)}));
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
  if(!signedIn) return r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Wrong key.'})});
  const rec=JSON.parse(req.postData()); store=[...store.filter(x=>x.id!==rec.id),rec];
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({recipe:rec,saved:rec.id})});
});

await page.goto(BASE+'/add-recipe');
await page.waitForSelector('form');
await page.getByRole('button',{name:'Link',exact:true}).click();
await page.getByLabel('Recipe page link').fill('https://example.com/x');
await page.getByRole('button',{name:/Fetch recipe/}).click();
await page.waitForSelector('text=What it found');

ok('Save is right there on the Link tab', await page.getByRole('button',{name:/Save to catalog/}).count()===1);
ok('Edit first is still offered', await page.getByRole('button',{name:/Edit first/}).count()===1);

await page.getByRole('button',{name:/Save to catalog/}).click();
await page.waitForTimeout(300);
ok('key prompt appears on this tab', await page.getByLabel('Catalog key').count()===1);
await page.getByLabel('Catalog key').fill(KEY);
await page.getByRole('button',{name:'Save',exact:true}).click();
await page.waitForSelector('[data-sonner-toast]');
ok('saved without visiting the form', store.length===1 && store[0].id==='mascarpone-whipped-cream', store);
ok('fields carried across', store[0].time===10 && store[0].servings===4 && store[0].ingredients.length===2 && store[0].ingredients[0].qty===8, store[0]);
ok('confirmation shown on the Link tab', (await page.textContent('body')).includes('is in the catalog'));
await page.screenshot({path: 'tests/browser/screenshots/linksave.png'});

await page.getByRole('link',{name:'Open it'}).click();
await page.waitForURL(/mascarpone-whipped-cream/);
await page.waitForTimeout(1200);
const h1=(await page.locator('h1').textContent()).trim();
ok('opens the saved recipe', h1==='Mascarpone Whipped Cream', h1);
console.log('   body snippet:', (await page.textContent('body')).slice(0,200).replace(/\s+/g,' '));

console.log('\nerrors:',errors.length?errors:'none');
await b.close();
