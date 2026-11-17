// Runs the Excel export from the Costing tab and checks the workbook: GCS Summary sheet totals match the app.
// Usage: node test/export-check.js <built.html> <fixture.json>
const fs=require('fs'),path=require('path');const {launch,openApp}=require('./harness');
const XLSX=require(path.join(process.env.NM||path.join(process.env.HOME,'tools/node_modules'),'xlsx'));
const [,,html,fx]=process.argv;
(async()=>{const b=await launch();const st=JSON.parse(fs.readFileSync(fx,'utf8'));
 const {page,errors}=await openApp(b,html,JSON.stringify(st));
 await page.click('.pcw-nav .pcw-tab >> nth=1');await page.waitForTimeout(500);
 const header=await page.$eval('.pcw-header-total',e=>e.innerText);
 await page.click('text=Excel Options');await page.waitForTimeout(200);
 const [dl]=await Promise.all([page.waitForEvent('download',{timeout:20000}),page.click('text=Export Excel')]);
 const file='/tmp/gcs-export.xlsx';await dl.saveAs(file);
 const wb=XLSX.readFile(file);const names=wb.SheetNames;
 const g=XLSX.utils.sheet_to_json(wb.Sheets['GCS Summary']||{},{header:1});
 const tcv=(g.find(r=>r[0]==='TOTAL CONTRACT VALUE')||[])[1];
 const cost=XLSX.utils.sheet_to_json(wb.Sheets['Costing'],{header:1});
 console.log(JSON.stringify({sheets:names,headerTotal:header,exportContractValue:tcv,costingHeader:cost[0],firstLine:cost[1],errors},null,1));
 await b.close();})().catch(e=>{console.error(e);process.exit(1);});
