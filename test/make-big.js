// Big stress fixture: N lines (mix of flat items and 3-level BOMs), several freight entries incl. supplier-tagged.
const fs=require('fs');const N=+process.argv[2]||10000;const out=process.argv[3];
const base=JSON.parse(fs.readFileSync(__dirname+'/fixtures/04-inbound-freight.json','utf8'));
const items=[];let k=0;const sup=['Supplier A','Supplier B','Supplier C','Supplier D'];
const mk=(o)=>({id:'b'+(++k),type:'item',parentId:null,sheetId:'main',partNumber:'PN-'+k,description:'Line '+k,drawingNumber:'',supplier:sup[k%4],
 qty:1+(k%5),unitCost:10+(k*7.31)%900,ccy:k%7===0?'EUR':'USD',source:k%11===0?'Pricelist':'Quotation',margin:20+(k%15),contingency:k%3,tariff:k%9===0?5:0,
 discount:k%13===0?5:0,leadTime:5+k%40,imported:false,afrmm:false,customsCharges:9,manualSellPrice:null,notes:'',...o});
while(items.length<N){ if(items.length%50===0){const p=mk({margin:25,unitCost:0});items.push(p);
   for(let j=0;j<8&&items.length<N;j++){const c=mk({parentId:p.id,margin:0});items.push(c);
     if(j%3===0) for(let g=0;g<3&&items.length<N;g++) items.push(mk({parentId:c.id,margin:0}));}}
  else items.push(mk({})); }
base.items=items;base.project.defaultDealer=3;base.project.discountMitigation=2;
base.freight.outbound=[{id:'o1',desc:'Out',cost:5000,ccy:'USD',leadTimeDays:5,freightQuotes:[],activeQuoteId:null,margin:15}];
fs.writeFileSync(out,JSON.stringify(base));console.log(items.length,'items',(fs.statSync(out).size/1e6).toFixed(2),'MB');
