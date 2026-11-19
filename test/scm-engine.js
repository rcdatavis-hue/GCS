// SCM engine checks against real files: master index parse, model file parse, search, line building.
// Usage: node test/scm-engine.js <built.html> <SCM_Master_Index.xlsm> <model.xlsx>
const fs=require('fs'),vm=require('vm'),path=require('path');
const [,,html,indexFile,modelFile]=process.argv;
const XLSX=require(path.join(process.env.NM||path.join(process.env.HOME,'tools/node_modules'),'xlsx'));
const code=[...fs.readFileSync(html,'utf8').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(m=>m[2]).filter(c=>c.trim())[0];
const ctx={console,Math,JSON,Map,Set,WeakMap,Object,Array,Number,String,Date,parseFloat,isFinite,isNaN,XLSX,performance,
 React:{createContext:()=>({}),useMemo:f=>f(),useCallback:f=>f,useRef:v=>({current:v}),useState:v=>[v,()=>{}],useEffect(){},useContext(){},memo:f=>f},
 crypto:{},window:{},document:{},localStorage:{getItem(){return null},setItem(){}},navigator:{},TextEncoder};ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(code+';this.__s={scmParseMasterIndex,scmParseModelFile,scmSearch,scmFilterOptions,scmBuildItems,scmInsertItems,scmLatestCost,buildTree};',ctx);
const S=ctx.__s;const res=[];const ok=(n,c,d)=>res.push({n,pass:!!c,d});
const t0=Date.now();const lib=S.scmParseMasterIndex(XLSX.read(fs.readFileSync(indexFile),{dense:true}));const ms=Date.now()-t0;
ok('master index: catalogue and lines read',lib.catalogue.length>500&&[...lib.linesByModel.values()].reduce((s,a)=>s+a.length,0)>19000,`${lib.catalogue.length} models, ${[...lib.linesByModel.values()].reduce((s,a)=>s+a.length,0)} lines, ${ms} ms`);
ok('data quality and refresh log read',lib.dataQuality.length>0&&lib.refreshLog&&lib.refreshLog['Refresh Completed'],JSON.stringify(lib.refreshLog));
const opts=S.scmFilterOptions(lib.catalogue);ok('filter lists built',opts.segment.length>2&&opts.bu.includes('ECL'),JSON.stringify(opts.segment)+' '+JSON.stringify(opts.bu));
const all=S.scmSearch(lib,{});ok('empty search returns every model',all.length===lib.catalogue.length,all.length);
const kw=S.scmSearch(lib,{keyword:'shea'});ok('keyword "shea" (contains, any case)',kw.length>0&&kw.every(r=>/shea/i.test([r.model['Model ID'],r.model['Model Description'],r.model['Root SAP Item'],r.model['Major Process'],r.model['Material']].join(' '))),kw.length);
const ex=S.scmSearch(lib,{segment:'Crush',bu:'ECL'});ok('exact filters Segment=Crush, BU=ECL',ex.length>0&&ex.every(r=>r.model.Segment==='Crush'&&r.model['Business Unit']==='ECL'),ex.length);
const dr=S.scmSearch(lib,{drawing:'F903-132'});ok('drawing search across model lines shows the matched line',dr.length>0&&dr.every(r=>r.matchedDrawing.includes('F903-132')),dr.slice(0,2).map(r=>r.model['Model ID']+' → '+r.matchedDrawing+' '+r.matchedItem).join(' | '));
const p=S.scmParseModelFile(XLSX.read(fs.readFileSync(modelFile),{dense:true}),path.basename(modelFile));
ok('model file: Model Info read',p.info['Model ID']&&p.info.Status==='Draft'&&p.info['Root SAP Item']==='10401649',JSON.stringify({id:p.info['Model ID'],st:p.info.Status,root:p.info['Root SAP Item'],rate:p.info.Rate}));
ok('model file: V1 with 57 lines',p.version===1&&p.lines.length===57,`v${p.version} ${p.lines.length} lines`);
const idx=lib.linesByModel.get(p.info['Model ID']);
ok('model file lines agree with the master index copy',idx&&idx.length===p.lines.length&&idx.every((l,i)=>l.sap===p.lines[i].sap&&Number(l.qty)===Number(p.lines[i].qty)),idx?idx.length:'model not in index');
let n=0;const newId=()=>'n'+(++n);const model=lib.catalogue.find(m=>m['Model ID']===p.info['Model ID'])||{'Model ID':p.info['Model ID'],'Model Description':p.info['Model Description']};
const items=S.scmBuildItems({model,lines:p.lines,version:p.version,sheetId:'main',newId,fileName:path.basename(modelFile)});
ok('V1 import: heading + 57 flat lines, SAP item in Part No.',items.length===58&&items[0].type==='heading'&&items.slice(1).every(i=>!i.parentId)&&items[1].partNumber==='10401649'&&items[12].qty===110,`${items.length} ${items[1].partNumber} qty(line 11)=${items[12].qty}`);
// V2: synthetic levels
const v2=p.lines.slice(0,6).map((l,i)=>({...l,bomLevel:[1,2,3,3,2,1][i],tag:'T'+i,supplierRef:'SR'+i}));
const it2=S.scmBuildItems({model,lines:v2,version:2,sheetId:'main',newId});
const tree=S.buildTree(it2.filter(i=>i.type!=='heading'));
ok('V2 import: BOM levels 1,2,3,3,2,1 become parent/child lines',tree.length===2&&tree[0]._ch.length===2&&tree[0]._ch[0]._ch.length===2&&it2[1].tag==='T0'&&it2[1].supplierRef==='SR0',JSON.stringify(tree.map(t=>[t.partNumber,t._ch.map(c=>[c.partNumber,c._ch.length])])));
// insertion
const base=[{id:'a',sheetId:'main'},{id:'b',sheetId:'main'},{id:'b1',parentId:'b',sheetId:'main'},{id:'c',sheetId:'main'},{id:'x',sheetId:'s2'}];
const ins=S.scmInsertItems(base,[{id:'N1'},{id:'N2'}],{sheetId:'main',afterId:'b',firstSheetId:'main'}).map(i=>i.id).join(',');
ok('insert after a line goes after its BOM children',ins==='a,b,b1,N1,N2,c,x',ins);
const ins2=S.scmInsertItems(base,[{id:'N1'}],{sheetId:'main',afterId:null,firstSheetId:'main'}).map(i=>i.id).join(',');
ok('insert at end of tab',ins2==='a,b,b1,c,N1,x',ins2);
const lc=S.scmLatestCost([{unitCost:0,date:'2026-01-01'},{unitCost:12,date:'2024-05-01'},{unitCost:15,date:'2025-02-01'}]);
ok('latest positive PO/PQ cost',lc&&lc.unitCost===15,JSON.stringify(lc));
res.forEach(r=>console.log(`${r.pass?'PASS':'FAIL'}  ${r.n}  → ${typeof r.d==='string'?r.d.slice(0,220):JSON.stringify(r.d)}`));
const f=res.filter(r=>!r.pass).length;console.log(f?`${f} FAILED`:`ALL ${res.length} PASS`);process.exit(f?1:0);
