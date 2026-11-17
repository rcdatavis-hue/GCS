// Old hooks (from a reference build) vs the shared engine (current build): identical results on random projects.
// Usage: node test/engine-equivalence.js <reference.html> <current.html> [runs]
const fs=require('fs'),vm=require('vm');const {parse}=require('@babel/parser');
const [,,refHtml,curHtml,runsArg]=process.argv;const RUNS=+runsArg||300;
const blocks=h=>{const re=/<script([^>]*)>([\s\S]*?)<\/script>/g;let m,o=[];while((m=re.exec(h)))if(m[2].trim())o.push(m[2]);return o;};
const pick=(code,names)=>{const body=parse(code,{sourceType:'script'}).program.body;
  return body.filter(s=>s.type==='FunctionDeclaration'&&names.includes(s.id.name)).map(s=>code.slice(s.start,s.end)).join('\n');};
function load(html){const [eng,ui]=blocks(fs.readFileSync(html,'utf8'));
  const ctx={console,Math,JSON,Map,Set,WeakMap,Object,Array,Number,String,Date,parseFloat,isFinite,crypto:{},window:{},document:{},localStorage:{getItem(){return null},setItem(){}},
    React:{createContext:()=>({}),useMemo:f=>f(),useCallback:f=>f,useRef:v=>({current:v}),useState:v=>[v,()=>{}],useEffect(){},useContext(){},memo:f=>f},indexedDB:undefined,navigator:{},TextEncoder};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(eng+
    '\n;'+pick(ui,['usePricingEngine','useSalesTaxEngine'])+'\n;this.__api={buildTree,calcNode,usePricingEngine,useSalesTaxEngine,computePricing:typeof computePricing!=="undefined"?computePricing:null};',ctx);
  return ctx.__api;}
const REF=load(refHtml),CUR=load(curHtml);
// seeded random
let seed=12345;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));const ch=a=>a[ri(0,a.length-1)];
const SUP=['Supplier A','Supplier B','supplier b','Supplier C',''],SRC=['Quotation','Pricelist','Estimate','Item Cost Use Guidance',''],CCY=['USD','EUR','GBP','BRL'];
function project(){const isCIT=rnd()<0.35;let k=0;const items=[];const n=ri(1,40);
  for(let i=0;i<n;i++){const parent=items.length&&rnd()<0.4?ch(items.filter(x=>x.type!=='heading')):null;
    if(rnd()<0.08){items.push({id:'h'+(++k),type:'heading',description:'H'});continue;}
    items.push({id:'x'+(++k),type:'item',parentId:parent?parent.id:null,partNumber:rnd()<0.9?'P'+k:'',description:rnd()<0.9?'D':'',supplier:ch(SUP),
      qty:ch([1,1,2,3,0.5,10]),unitCost:rnd()<0.12?0:+(rnd()*2000).toFixed(ri(0,4)),ccy:ch(CCY),source:ch(SRC),margin:ch([0,10,25,33.3,99,100,120]),
      contingency:ch([0,0.5,1,5,100]),tariff:ch([0,0,5,12.5]),discount:ch([0,0,5,10]),leadTime:ri(0,60),imported:rnd()<0.4,afrmm:rnd()<0.3,
      customsCharges:ch([9,9,5,undefined]),manualSellPrice:rnd()<0.1?+(rnd()*3000).toFixed(2):null});}
  const fe=(inb)=>({id:'f'+(++k),cost:ch([0,50,300,1234.5]),ccy:ch(CCY),afrmm:rnd()<0.4,supplierTags:inb&&rnd()<0.4?[ch(SUP),...(rnd()<0.3?[ch(SUP)]:[])]:[],
    ...(inb&&rnd()<0.1?{supplierTags:undefined,supplierTag:ch(SUP)}:{}),margin:ch([0,10,25,100]),marginMode:ch(['margin','markup',undefined])});
  const proj={bu:isCIT?'CIT':ch(['CIW','ECL','CIA']),sellCcy:ch(CCY),rates:{USD:1,GBP:0.79,EUR:0.92,ARS:1000,BRL:5.8},defaultDealer:ch([0,3,5]),discountMitigation:ch([0,2,3]),
    siscomexOverride:ch([null,undefined,0,500]),afrmmRate:ch([8,25,undefined]),customsCharges:ch([9,7,undefined]),salesType:ch(['Industrialized','Direct'])};
  const frt={inbound:Array.from({length:ri(0,4)},()=>fe(true)),outbound:Array.from({length:ri(0,3)},()=>fe(false)),
    packingCrating:rnd()<0.5?{enabled:true,mode:ch(['pct','cost','fixed',undefined]),pct:ch([0,2.5]),cost:ch(['350','',null]),costCcy:ch(CCY),margin:ch([0,20,100]),marginMode:ch(['margin','markup']),overrideAmt:ch([null,'99.5'])}:{enabled:false}};
  const brazilTaxes={};items.forEach(i=>{if(rnd()<0.2)brazilTaxes[i.id]={ipi:ch([0,5,10]),ii:ch([undefined,14,20])};});
  return {items,proj,frt,brazilTaxes,brazilStates:{origin:ch(['SP','MG','RJ']),destination:ch(['SP','MG','BA'])},isCIT,
    forceAllocToPricelist:rnd()<0.3,forceAllocToZeroCost:{freight:rnd()<0.3,siscomex:rnd()<0.3,afrmm:rnd()<0.3},distributeOutboundFreight:rnd()<0.4,distributePackingCrating:rnd()<0.4};}
const ser=(v,d=0)=>{if(v instanceof Map)return ser(Object.fromEntries([...v.entries()].map(([k,x])=>[k,x])),d);
  if(Array.isArray(v))return v.map(x=>ser(x,d+1));if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v).sort())if(k!=='_ch'||d<1)o[k]=ser(v[k],d+1);return o;}
  if(typeof v==='number')return Object.is(v,-0)?'-0':String(v);return v;};
function run(api,P){const tree=api.buildTree(P.items).map(n=>api.calcNode(n,P.proj.rates,P.proj.sellCcy,{isCIT:P.isCIT,brazilTaxes:P.brazilTaxes,proj:P.proj}));
  const pe=api.usePricingEngine({tree,...P});
  const st=api.computePricing?api.useSalesTaxEngine({tree,proj:P.proj,brazilTaxes:P.brazilTaxes,brazilStates:P.brazilStates,isCIT:P.isCIT,pricing:pe,distributeOutboundFreight:P.distributeOutboundFreight,items:P.items})
   :api.useSalesTaxEngine({tree,proj:P.proj,brazilTaxes:P.brazilTaxes,brazilStates:P.brazilStates,isCIT:P.isCIT,grand:pe.grand,grandWithTax:pe.grandWithTax,landedCOGS:pe.landedCOGS,itemsSP:pe.itemsSP,getItemSP:pe.getItemSP,getItemNetPrice:pe.getItemNetPrice,getAlloc:pe.getAlloc,totalOutSP:pe.totalOutSP,distributeOutboundFreight:P.distributeOutboundFreight,freightTaxSC:pe.freightTaxSC,items:P.items});
  const out={};const nodes=[];const v=n=>{nodes.push(n);(n._ch||[]).forEach(v);};tree.forEach(v);
  for(const k in pe)if(typeof pe[k]!=='function')out['pe.'+k]=ser(pe[k]);for(const k in st)if(typeof st[k]!=='function')out['st.'+k]=ser(st[k]);
  // call every per-node function (also with a copy of the node, as callers sometimes pass one)
  out.perNode=nodes.map(n=>{const c={...n};return ser({alloc:pe.getAlloc(n),allocCopy:pe.getAlloc(c),sp:pe.getItemSP(n),spCopy:pe.getItemSP(c),net:pe.getItemNetPrice(n),spTax:pe.getItemSPWithSalesTax(n),
    rev:[pe.calculateReverseMargin(n,100),pe.calculateReverseMargin(n,1234.56)],bt:st.getBT(n.id),salesTax:st.getItemSalesTax(n),impDetail:st.getItemImportTaxDetail(n)});});
  return JSON.stringify(out);}
let fails=0;for(let r=0;r<RUNS;r++){const P=project();const a=run(REF,JSON.parse(JSON.stringify(P))),b=run(CUR,JSON.parse(JSON.stringify(P)));
  if(a!==b){fails++;if(fails<=3){let i=0;while(a[i]===b[i])i++;console.log('MISMATCH run',r,'\n ref:',a.slice(Math.max(0,i-150),i+80),'\n cur:',b.slice(Math.max(0,i-150),i+80));}}}
console.log(`${RUNS} random projects: ${fails?fails+' MISMATCHED':'all identical'}`);process.exit(fails?1:0);
