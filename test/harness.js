// Shared Playwright harness: loads a built PCW file with CDN scripts served from local npm packages.
const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PW||'playwright');
const NM=process.env.NM||path.join(process.env.HOME,'tools/node_modules');
const LIBS={'react/18.2.0/umd/react.production.min.js':'react/umd/react.production.min.js',
 'react-dom/18.2.0/umd/react-dom.production.min.js':'react-dom/umd/react-dom.production.min.js',
 'xlsx/0.18.5/xlsx.full.min.js':'xlsx/dist/xlsx.full.min.js','jszip/3.10.1/jszip.min.js':'jszip/dist/jszip.min.js'};
async function launch(){return chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--no-sandbox']});}
// Fork stores its autosave under 'gcs-state-v1' (the PCW uses 'pcw-state-v1').
const STATE_KEY=process.env.STATE_KEY||'gcs-state-v1';
async function openApp(browser,htmlPath,stateJson,{width=1600,height=1000,extraStorage=null}={}){
  const ctx=await browser.newContext({viewport:{width,height},timezoneId:'Europe/London',locale:'en-GB'});
  // Test copy: drop SRI hashes (local package bytes may differ from cdnjs) — the app file itself is unchanged.
  const html=fs.readFileSync(htmlPath,'utf8').replace(/ integrity="[^"]*"/g,'');
  await ctx.route('**/*',async r=>{const u=r.request().url();
    if(u.startsWith('http://pcw.test/')) return r.fulfill({contentType:'text/html',body:html});
    const k=Object.keys(LIBS).find(k=>u.includes(k));
    if(k) return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(NM,LIBS[k]))});
    if(u.includes('fonts.g')) return r.fulfill({contentType:'text/css',body:''});
    if(u.endsWith('/sw.js')||u.includes('manifest')) return r.fulfill({status:404,body:''});
    return r.continue();});
  const page=await ctx.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  if(stateJson!=null) await ctx.addInitScript(([s,key,extra])=>{try{if(!sessionStorage.getItem('__seeded')){localStorage.clear();Object.entries(extra||{}).forEach(([k,v])=>localStorage.setItem(k,v));if(s!==null)localStorage.setItem(key,s);sessionStorage.setItem('__seeded','1');}}catch(e){}},[stateJson===''?null:stateJson,STATE_KEY,extraStorage]);
  await page.goto('http://pcw.test/index.html');
  await page.waitForSelector('.pcw-nav .pcw-tab',{timeout:30000});
  await page.waitForTimeout(400);
  return {ctx,page,errors};
}
module.exports={launch,openApp};
