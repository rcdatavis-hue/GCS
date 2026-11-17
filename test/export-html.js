// Clicks the Summary tab's HTML and PDF exports and reports any page errors and the contract value in the HTML.
const fs=require('fs');const {launch,openApp}=require('./harness');const [,,html,fx]=process.argv;
(async()=>{const b=await launch();const {page,errors}=await openApp(b,html,fs.readFileSync(fx,'utf8'));
 await page.click('.pcw-nav .pcw-tab >> nth=4');await page.waitForTimeout(500);
 const out={};
 for(const label of ['HTML','PDF']){const btn=page.locator('button',{hasText:label}).first();if(!(await btn.count())){out[label]='no button';continue;}
  const pop=page.context().waitForEvent('page',{timeout:5000}).catch(()=>null);const dl=page.waitForEvent('download',{timeout:5000}).catch(()=>null);
  await btn.click();const [p,d]=await Promise.all([pop,dl]);
  if(d){const f='/tmp/exp-'+label+'.html';await d.saveAs(f);const t=fs.readFileSync(f,'utf8');out[label]={download:d.suggestedFilename(),bytes:t.length,hasMarkup:/Markup/.test(t),hasCtg:/Contingency/i.test(t)};}
  else if(p){await p.waitForLoadState().catch(()=>{});const t=await p.content();out[label]={popup:true,bytes:t.length,hasMarkup:/Markup/.test(t),hasCtg:/Contingency/i.test(t)};await p.close();}
  else out[label]='nothing opened';}
 console.log(JSON.stringify({out,errors},null,1));await b.close();})();
