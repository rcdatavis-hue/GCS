// Usage: node test/perf.js <built.html> <state.json> [profileOut.json]
// Opens the big project, edits Qty of the first visible leaf 3 times, reports open time and per-edit commit time.
const fs=require('fs');const {launch,openApp}=require('./harness');
const [,,html,stateFile,prof]=process.argv;
(async()=>{const b=await launch();const st=fs.readFileSync(stateFile,'utf8');
 const t0=Date.now();const {page,errors}=await openApp(b,html,st,{width:1600,height:1000});
 await page.click('.pcw-nav .pcw-tab >> nth=1');await page.waitForSelector('[data-cell$="-qty"]',{timeout:60000});
 const open=Date.now()-t0;const rows=await page.$$eval('tbody tr',r=>r.length);
 const readTotal=()=>page.evaluate(()=>{const t=document.getElementById('root').innerText.match(/Landed:[^\n]*\n([^\n]*)/);return t?t[1]:'';});
 let cdp;if(prof){cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:200});await cdp.send('Profiler.start');}
 const times=[];
 for(const v of ['7','3','9']){
  const cell=page.locator('[data-cell="b2-qty"]').first();await cell.click();await page.waitForTimeout(150);
  const before=await readTotal();
  await page.keyboard.press('Control+A');await page.keyboard.type(v);
  const s=Date.now();await page.keyboard.press('Tab');
  await page.waitForFunction(b=>{const t=document.getElementById('root').innerText.match(/Landed:[^\n]*\n([^\n]*)/);return t&&t[1]!==b;},before,{timeout:30000,polling:16});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  times.push(Date.now()-s);}
 if(prof){const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(prof,JSON.stringify(profile));}
 console.log(JSON.stringify({open_ms:open,rows_drawn:rows,edit_ms:times,total:await readTotal(),errors:errors.slice(0,3)}));
 await b.close();})().catch(e=>{console.error(e);process.exit(1);});
