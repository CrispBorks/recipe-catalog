import { BASE, launch, ok } from './_harness.mjs';
const b=await launch();
const page=await b.newPage({viewport:{width:390,height:1000}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));

const RECIPE={title:"Best Banana Bread",time:"75",servings:"12",tags:["dessert","banana"],
 ingredients:[{qty:"3",unit:"",name:"ripe bananas"},{qty:"0.5",unit:"cup",name:"butter, melted"}],
 steps:["Heat the oven to 350°F.","Mash the bananas.","Bake 60 minutes."],
 notes:["Moist & easy banana bread.","https://example.com/banana"],sectioned:true,
 sourceUrl:"https://example.com/banana",sourceName:"Jo Cook"};

await page.route('**/api/import*', route => {
  const u=new URL(route.request().url());
  const target=u.searchParams.get('url')||'';
  if (target.includes('nolddata')) return route.fulfill({status:422,contentType:'application/json',
    body:JSON.stringify({error:"That page doesn't publish its recipe in a readable format. Copy the recipe text and use the Paste text tab."})});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(RECIPE)});
});

await page.goto(BASE+'/add-recipe');
await page.waitForSelector('form');
await page.getByRole('button',{name:'Link',exact:true}).click();
await page.waitForTimeout(200);
ok('Link tab opens', await page.getByLabel('Recipe page link').count()===1);
ok('fetch disabled while empty', await page.getByRole('button',{name:/Fetch recipe/}).isDisabled());

// segmented control must not overflow the 390px viewport
const box = await page.locator('[role="group"][aria-label="How to add recipes"]').boundingBox();
ok(`the mode control fits in 390px (right edge ${Math.round(box.x+box.width)})`, box.x+box.width <= 390);

await page.getByLabel('Recipe page link').fill('https://example.com/banana');
await page.getByRole('button',{name:/Fetch recipe/}).click();
await page.waitForSelector('text=What it found');
const body=await page.textContent('body');
ok('summary shown', /75 min/.test(body)&&/serves 12/.test(body)&&/2 ingredients/.test(body), (body.match(/title[^\n]{0,80}/)||[''])[0]);
ok('credits the author', body.includes('By Jo Cook'));
await page.screenshot({path: 'tests/browser/screenshots/link-preview.png'});

await page.getByRole('button',{name:/Review in the form/}).click();
await page.waitForTimeout(400);
ok('the builder form is filled in', await page.getByLabel('ID (slug)').count()===1);
ok(`title filled`, await page.getByLabel('Title').inputValue()==='Best Banana Bread');
ok(`slug derived`, await page.getByLabel('ID (slug)').inputValue()==='best-banana-bread');
ok(`time filled`, await page.getByLabel('Time (minutes)').inputValue()==='75');
ok('2 ingredient rows', await page.getByRole('textbox',{name:/^Ingredient \d+$/}).count()===2);
ok('3 step rows', await page.getByRole('textbox',{name:/^Step \d+$/}).count()===3);
ok('source url kept in notes', (await page.getByRole('textbox',{name:'Note 2',exact:true}).inputValue()).includes('example.com'));
ok('tags pre-selected', await page.getByRole('button',{name:'banana',exact:true}).getAttribute('aria-pressed')==='true');

// saving from here is covered by link-save.mjs

// error path
await page.getByRole('button',{name:'Link',exact:true}).click();
await page.waitForTimeout(200);
await page.getByLabel('Recipe page link').fill('https://example.com/nolddata');
await page.getByRole('button',{name:/Fetch recipe/}).click();
await page.waitForSelector('[role="alert"]');
ok('unsupported page shows a useful error', (await page.locator('[role="alert"]').textContent()).includes('Paste text tab'));
await page.screenshot({path: 'tests/browser/screenshots/link-error.png'});

console.log('\nerrors:',errors.length?errors:'none');
await b.close();
