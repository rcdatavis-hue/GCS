// The TOTALS row under the costing table totals the tab on screen; the line-sales row below it is all tabs.
// Usage: node test/tab-totals.js <built.html>
const fs = require('fs'); const { launch, openApp } = require('./harness');
const html = process.argv[2];
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });
const num = s => parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
const st = JSON.parse(JSON.stringify(base)); st.gcsFormat = 1; st.project = { ...st.project, defaultDealer: 0, discountMitigation: 0 };
st.costingSheets = [{ id: 'main', name: 'Plant Section 1' }, { id: 's2', name: 'Plant Section 2' }];
st.items = [
  { id: 'A', type: 'item', parentId: null, sheetId: 'main', partNumber: 'PA', description: 'a', supplier: 'S', qty: 2, unitCost: 1000, ccy: 'USD', source: 'Quotation', markupLevel: 'CROWN (A)' },
  { id: 'B', type: 'item', parentId: null, sheetId: 's2', partNumber: 'PB', description: 'b', supplier: 'S', qty: 1, unitCost: 300, ccy: 'USD', source: 'Quotation', markupLevel: 'PASS' },
  { id: 'C', type: 'item', parentId: null, sheetId: 's2', partNumber: 'PC', description: 'c', supplier: 'S', qty: 1, unitCost: 200, ccy: 'USD', source: 'Quotation', markupLevel: 'PASS' }];
(async () => {
  const b = await launch(); const { page, errors } = await openApp(b, html, JSON.stringify(st));
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="A-partNo"]');
  const foot = () => page.$eval('tfoot tr', tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim()).filter(Boolean));
  const grand = () => page.$$eval('tfoot tr', trs => trs.map(t => t.innerText).find(t => /LINE SALES TOTAL/.test(t)) || '');
  const f1 = await foot(); const g1 = await grand();
  await page.click('text=Plant Section 2'); await page.waitForSelector('[data-cell="B-partNo"]'); await page.waitForTimeout(200);
  const f2 = await foot(); const g2 = await grand();
  ok('tab 1 totals = its own line (COGS 2,000; sales 2,000 / 0.52)', /PLANT SECTION 1/.test(f1[0]) && num(f1[1]) === 2000 && Math.abs(num(f1[f1.length - 1]) - 2000 / 0.52) < 0.02, f1.join(' | '));
  ok('tab 2 totals = its own lines (COGS 500; sales 500 at PASS)', /PLANT SECTION 2/.test(f2[0]) && num(f2[1]) === 500 && num(f2[f2.length - 1]) === 500, f2.join(' | '));
  ok('line sales total row still covers all tabs', g1 === g2 && Math.abs(num(g2.replace(/^[^0-9]*/, '')) - (2000 / 0.52 + 500)) < 0.02, g2.replace(/\s+/g, ' '));
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})();
