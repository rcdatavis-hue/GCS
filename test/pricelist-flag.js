// Unit Cost edit on a pricelist-autofilled row: tabbing through keeps the flag, typing a new cost clears it.
const fs=require('fs');const {launch,openApp}=require('./harness');const html=process.argv[2];
const st=JSON.parse(fs.readFileSync(__dirname+'/fixtures/01-flat-basic.json','utf8'));
st.items[0]._autoPricelist=true;st.items[0].source='Pricelist';const id=st.items[0].id;
(async()=>{const b=await launch();const {page,errors}=await openApp(b,html,JSON.stringify(st));
 await page.click('.pcw-nav .pcw-tab >> nth=1');const sel=`[data-cell="${id}-unitCost"]`;await page.waitForSelector(sel);
 const cls=()=>page.$eval(sel,e=>e.className.includes('pcw-ci-pricelist'));
 const r={start:await cls()};
 await page.click(sel);await page.keyboard.press('Tab');await page.waitForTimeout(300);r.afterTabThrough=await cls();
 await page.click(sel);await page.keyboard.press('Control+A');await page.keyboard.type('123');await page.keyboard.press('Tab');await page.waitForTimeout(300);
 r.afterTypedCost=await cls();r.value=await page.$eval(sel,e=>e.value);r.errors=errors;console.log(JSON.stringify(r));await b.close();})();
