// Usage: node test/snapshot.js <built.html> <outdir>
// For each fixture: visit every tab and record the visible text of the main panel (+ header KPIs).
const fs=require('fs'),path=require('path');const {launch,openApp}=require('./harness');
const [,,html,outDir]=process.argv;fs.mkdirSync(outDir,{recursive:true});
const norm=s=>s.replace(/v\d+\.\d+ · \d{4}-\d{2}-\d{2}/g,'<build>').replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,'<date>').replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g,'<iso>')
 .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g,'<time>').replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n');
(async()=>{const b=await launch();const fx=fs.readdirSync(path.join(__dirname,'fixtures')).filter(f=>f.endsWith('.json')).sort();
 for(const f of fx){const st=fs.readFileSync(path.join(__dirname,'fixtures',f),'utf8');
  const {ctx,page,errors}=await openApp(b,html,st);let out='';
  const tabs=await page.$$eval('.pcw-nav .pcw-tab',bs=>bs.map(b=>b.textContent));
  for(let i=0;i<tabs.length;i++){await page.click(`.pcw-nav .pcw-tab >> nth=${i}`);await page.waitForTimeout(350);
   const t=await page.$eval('.pcw-main',m=>{const SER=root=>{const out=[];const BLOCK=/^(DIV|P|TR|LI|H\d|SECTION|TABLE|TBODY|THEAD|TFOOT|UL|OL|HEADER|NAV|MAIN|LABEL|BR)$/;
 const walk=n=>{if(n.nodeType===3){const t=n.textContent.trim();if(t)out.push(t);return;}if(n.nodeType!==1)return;
  if(n.checkVisibility&&!n.checkVisibility())return;const tg=n.tagName;
  if(tg==='INPUT'){out.push(n.type==='checkbox'||n.type==='radio'?(n.checked?'[x]':'[ ]'):'['+n.value+']');return;}
  if(tg==='SELECT'){out.push('['+(n.selectedOptions[0]?n.selectedOptions[0].textContent:'')+']');return;}
  if(tg==='TEXTAREA'){out.push('['+n.value+']');return;}
  if(tg==='SCRIPT'||tg==='STYLE')return;
  if(BLOCK.test(tg))out.push('\n');if(tg==='TD'||tg==='TH')out.push('|');
  for(const c of n.childNodes)walk(c);if(BLOCK.test(tg))out.push('\n');};
 walk(root);return out.join(' ').replace(/ *\n */g,'\n');};return SER(m);});out+=`\n===== TAB ${tabs[i]}\n`+norm(t);}
  const hdr=await page.evaluate(()=>{const m=document.querySelector('.pcw-main');let t='';document.querySelectorAll('#root *').forEach(()=>{});const r=document.getElementById('root').cloneNode(true);r.querySelector('.pcw-main')?.remove();r.querySelector('nav')?.remove();return r.innerText;}).catch(()=>'');
  out=`===== HEADER\n${norm(hdr)}`+out+`\n===== ERRORS\n${errors.filter(e=>!/sw\.js|ServiceWorker|manifest|favicon|404/.test(e)).join('\n')}\n`;
  fs.writeFileSync(path.join(outDir,f.replace('.json','.txt')),out);console.log(f,out.length,'chars, errors:',errors.length);
  await ctx.close();}
 await b.close();})().catch(e=>{console.error(e);process.exit(1);});
