// The fork must ignore the PCW's browser data and leave it untouched; it must still open a PCW .pcw file.
const fs=require('fs'),os=require('os'),path=require('path');const {launch,openApp}=require('./harness');const html=process.argv[2];
const pcwState=fs.readFileSync(__dirname+'/fixtures/02-nested-bom.json','utf8');
(async()=>{const b=await launch();
 const extra={'pcw-state-v1':pcwState,'pcw-dark-mode':'true','pcw-col-order':'["partNo"]'};
 const {page,errors}=await openApp(b,html,'',{extraStorage:extra});
 const r={};r.headerOnOpen=(await page.$eval('#root',e=>e.innerText)).match(/Landed:[^\n]*\n[^\n]*/)?.[0];
 r.darkModeLeak=await page.evaluate(()=>document.documentElement.outerHTML.includes('pcw-dark')||document.body.className);
 // make an edit in the fork so it autosaves, then check PCW keys are unchanged
 await page.click('.pcw-nav .pcw-tab >> nth=0');
 const nameInput=page.locator('input').first();await nameInput.fill('Fork project');await page.waitForTimeout(2500);
 r.keys=await page.evaluate(()=>Object.keys(localStorage).sort());
 r.pcwStateUntouched=await page.evaluate(s=>localStorage.getItem('pcw-state-v1')===s,pcwState);
 // open a PCW .pcw file through Upload
 const tmp=path.join(os.tmpdir(),'Q-PARTS.pcw');fs.writeFileSync(tmp,pcwState);
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.click('text=Upload')]);
 r.accepts=await chooser.element().evaluate(e=>e.accept);await chooser.setFiles(tmp);await page.waitForTimeout(1200);
 r.headerAfterPcwOpen=(await page.$eval('#root',e=>e.innerText)).match(/Landed:[^\n]*\n[^\n]*/)?.[0];
 r.errors=errors;console.log(JSON.stringify(r,null,1));await b.close();})().catch(e=>{console.error(e);process.exit(1);});
