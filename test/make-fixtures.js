// Generates the regression fixtures (persisted-state JSON, as stored in localStorage['pcw-state-v1']).
const fs=require('fs'),path=require('path');
const RATES={USD:1,GBP:0.79,EUR:0.92,ARS:1000,BRL:5.80};
let n=0;const id=p=>`${p}${++n}`;
const proj=(o={})=>({name:"Fixture",ref:"Q-TEST",rev:"0",bu:"CIW",customer:{name:"Test Co",code:"C1",ref:"",country:"UK"},
 sellCcy:"USD",rates:{...RATES},defaultMargin:0,defaultContingency:0,defaultDealer:0,discountMitigation:0,sAndAExpense:10,
 source:"",notes:"",incoterm:"EXW",freightPaymentTerm:"",paymentTerms:"",insideSales:"",outsideSales:"",rfqDate:"2026-11-01",
 revisionDate:"",afrmmRate:8,customsCharges:9,recapBenefit:"N",salesType:"Industrialized",locked:false,ratesRefreshedAt:null,
 packagedAt:null,approvals:[],...o});
const item=(o={})=>({id:id('i'),type:"item",parentId:null,sheetId:"main",partNumber:"P-"+n,description:"Part "+n,drawingNumber:"",
 supplier:"Supplier A",qty:1,unitCost:0,ccy:"USD",source:"Quotation",margin:25,contingency:0,tariff:0,discount:0,leadTime:10,
 imported:false,afrmm:false,customsCharges:9,manualSellPrice:null,notes:"",...o});
const fe=(o={},inb=true)=>({id:id('f'),desc:"Freight "+n,cost:0,ccy:"USD",leadTimeDays:7,freightQuotes:[],activeQuoteId:null,
 ...(inb?{afrmm:false,supplierTags:[]}:{margin:0}),...o});
const state=(o)=>({project:proj(o.project),items:o.items,freight:{inbound:o.inbound||[],outbound:o.outbound||[],
 packingCrating:o.pc||{enabled:false,pct:0,overrideAmt:null}},
 schedule:{start:"2026-11-01",phases:[{id:"ph1",name:"PO Processing",days:5},{id:"ph2",name:"Fabrication",days:20}],salesforceLink:"",sharepointLink:""},
 brazilTaxes:o.brazilTaxes||{},brazilStates:o.brazilStates||{origin:"SP",destination:"SP"},
 forceAllocToPricelist:!!o.fPL,forceAllocToZeroCost:o.fZC||{freight:false,siscomex:false,afrmm:false},
 distributeOutboundFreight:!!o.dOut,distributePackingCrating:!!o.dPC,language:"en",dateFormat:"DD/MM/YYYY",rowColors:{},
 costingSheets:o.sheets||[{id:"main",name:"Sheet 1"}],activeSheetId:"main"});
const F={};
// 1 flat items, project-level dealer + mitigation, contingency
F['01-flat-basic']=state({project:{defaultDealer:5,discountMitigation:3},items:[
 item({unitCost:100,qty:2,margin:30,contingency:5}),item({unitCost:250.5,qty:1,margin:20}),item({unitCost:12.34,qty:40,margin:35,supplier:"Supplier B"}),
 item({unitCost:0,qty:1,margin:0,partNumber:"",description:""})]});
// 2 nested BOM, manual sell on parent and on a leaf
{const p=item({unitCost:50,qty:2,margin:28,description:"Assembly"});const c1=item({parentId:p.id,unitCost:30,qty:3,margin:0});
 const c2=item({parentId:p.id,unitCost:0,qty:1,margin:0,description:"Sub-assy"});const g1=item({parentId:c2.id,unitCost:15,qty:4});
 const g2=item({parentId:c2.id,unitCost:7.5,qty:2,supplier:"Supplier B"});const p2=item({unitCost:0,qty:1,manualSellPrice:900,description:"Kit"});
 const k1=item({parentId:p2.id,unitCost:120,qty:2});const solo=item({unitCost:80,qty:3,manualSellPrice:150});
 F['02-nested-bom']=state({items:[p,c1,c2,g1,g2,p2,k1,solo]});}
// 3 multi-currency, sell in GBP
F['03-multi-currency']=state({project:{sellCcy:"GBP"},items:[item({unitCost:1000,ccy:"EUR",margin:22}),item({unitCost:500,ccy:"USD",qty:3}),
 item({unitCost:420,ccy:"GBP",margin:18}),item({unitCost:9500,ccy:"BRL",qty:2,margin:30})],
 inbound:[fe({cost:300,ccy:"EUR"})],outbound:[fe({cost:200,ccy:"GBP",margin:15},false)]});
// 4 inbound freight: untagged + supplier-tagged, pricelist + zero-cost items, force-alloc off
{const items=[item({unitCost:400,supplier:"Supplier A"}),item({unitCost:600,qty:2,supplier:"Supplier B"}),item({unitCost:300,source:"Pricelist",supplier:"Supplier A"}),
 item({unitCost:0,supplier:"Supplier B"}),item({unitCost:150,supplier:"Supplier C"})];
 const inbound=[fe({cost:500}),fe({cost:240,supplierTags:["Supplier B"]}),fe({cost:90,supplierTags:["Supplier A","Supplier C"]}),fe({cost:60,supplierTags:["Nobody Ltd"]})];
 F['04-inbound-freight']=state({items,inbound});
 // 5 same with force allocation on
 F['05-inbound-forced']=state({items:JSON.parse(JSON.stringify(items)),inbound:JSON.parse(JSON.stringify(inbound)),fPL:true,fZC:{freight:true,siscomex:false,afrmm:false}});}
// 6 outbound freight markup/margin modes, distributed into items
F['06-outbound-distributed']=state({project:{defaultDealer:2},items:[item({unitCost:1000,margin:20}),item({unitCost:250,qty:4,margin:30}),item({unitCost:90,qty:1,manualSellPrice:200})],
 outbound:[fe({cost:400,margin:20},false),fe({cost:150,margin:25,marginMode:"markup"},false)],dOut:true});
// 7 packing & crating: pct mode not distributed; then cost mode distributed
F['07-packing-pct']=state({items:[item({unitCost:800,margin:25}),item({unitCost:200,qty:5,margin:15,discount:10})],outbound:[fe({cost:100,margin:10},false)],
 pc:{enabled:true,mode:"pct",pct:2.5,overrideAmt:null}});
F['08-packing-cost-distributed']=state({items:[item({unitCost:800,margin:25}),item({unitCost:200,qty:5,margin:15,tariff:7.5})],outbound:[fe({cost:100,margin:10},false)],
 pc:{enabled:true,mode:"cost",cost:"350",costCcy:"EUR",margin:20,marginMode:"margin",pct:0,overrideAmt:null},dPC:true});
// 9 CIT Brazil: imported/afrmm leaves and BOM, siscomex, Direct sale, sales taxes
{const a=item({unitCost:1200,imported:true,afrmm:true,margin:30});const b=item({unitCost:300,qty:2,margin:25});
 const p=item({unitCost:0,margin:20,description:"Imported assy"});const c=item({parentId:p.id,unitCost:500,imported:true,afrmm:true});const d=item({parentId:p.id,unitCost:80,qty:3,imported:true});
 F['09-cit-brazil']=state({project:{bu:"CIT",sellCcy:"BRL",salesType:"Direct"},items:[a,b,p,c,d],
  inbound:[fe({cost:700,afrmm:true}),fe({cost:100})],outbound:[fe({cost:1500,ccy:"BRL",margin:12},false)],
  brazilTaxes:{[b.id]:{ipi:5}},brazilStates:{origin:"SP",destination:"MG"}});}
// 10 multi-sheet + headings + per-item discounts
F['10-sheets-headings']=state({sheets:[{id:"main",name:"Sheet 1"},{id:"s2",name:"Options"}],items:[
 {id:"h1",type:"heading",sheetId:"main",description:"Section A"},item({unitCost:100,qty:3,discount:5}),item({unitCost:55,margin:40}),
 {id:"h2",type:"heading",sheetId:"main",description:"Section B"},item({unitCost:999,discount:12.5}),
 item({sheetId:"s2",unitCost:4000,margin:18}),item({sheetId:"s2",unitCost:35,qty:10})]});
for(const k in F) fs.writeFileSync(path.join(__dirname,'fixtures',k+'.json'),JSON.stringify(F[k],null,1));
console.log(Object.keys(F).length,'fixtures');
