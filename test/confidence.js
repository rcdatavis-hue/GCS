// Costing confidence strip (share of line cost by Source) in Tab settings and on Summary.
// Usage: node test/confidence.js <built.html>
const fs = require('fs'); const { launch, openApp } = require('./harness');
const html = process.argv[2];
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
const st = JSON.parse(JSON.stringify(base)); st.gcsFormat = 1; st.project = { ...st.project, defaultDealer: 0, discountMitigation: 0 };
st.costingSheets = [{ id: 'main', name: 'Plant Section 1' }, { id: 's2', name: 'Plant Section 2' }];
const L = (id, sheetId, extra) => ({ id, type: 'item', parentId: null, sheetId, partNumber: id, description: id, supplier: 'S', qty: 1, unitCost: 0, ccy: 'USD', source: '', ...extra });
st.items = [L('Q', 'main', { unitCost: 1000, source: 'Quotation' }), L('P', 'main', { unitCost: 1000, qty: 3, source: 'Project Cost' }),
  L('B', 'main', { qty: 2, source: 'Quotation' }), L('B1', 'main', { parentId: 'B', unitCost: 500, source: 'Estimate' }), L('B2', 'main', { parentId: 'B', unitCost: 250 }),
  L('X', 's2', { unitCost: 100, source: 'EQD' })];
(async () => {
  const b = await launch(); const { page, errors } = await openApp(b, html, JSON.stringify(st));
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="Q-partNo"]');
  const parts = sel => page.$$eval(`${sel} [data-conf-part]`, els => Object.fromEntries(els.map(e => [e.getAttribute('data-conf-part'), +e.getAttribute('data-conf-pct')])));
  const t1 = await parts('[data-gcs=tab-settings] [data-gcs-confidence="tab"]');
  // total 1000 + 3000 + (500+250)*2 = 5500
  ok('tab strip: Quotation 18.2%, Project Cost 54.5%, Estimate 18.2%, no source 9.1% (BOM children × parent qty)', Math.abs(t1.Quotation - 18.2) < 0.1 && Math.abs(t1['Project Cost'] - 54.5) < 0.1 && Math.abs(t1.Estimate - 18.2) < 0.1 && Math.abs(t1['No source'] - 9.1) < 0.1, JSON.stringify(t1));
  const legend = await page.$eval('[data-gcs=tab-settings]', e => e.innerText.replace(/\s+/g, ' '));
  ok('tab settings bar shows the two largest shares', /Confidence\s*Project Cost 55%\s*·\s*Quotation 18%/.test(legend), legend.slice(legend.indexOf('Confidence'), legend.indexOf('Confidence') + 80));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '-tab.png', clip: { x: 0, y: 130, width: 1600, height: 140 } });
  await page.click('text=Plant Section 2'); await page.waitForSelector('[data-cell="X-partNo"]'); await page.waitForTimeout(200);
  const t2 = await parts('[data-gcs=tab-settings] [data-gcs-confidence="tab"]');
  ok('tab 2 strip is its own (EQD 100%)', Object.keys(t2).length === 1 && t2.EQD === 100, JSON.stringify(t2));
  await page.click('.pcw-nav .pcw-tab >> text=Summary'); await page.waitForSelector('[data-gcs=confidence]');
  const proj = await parts('[data-gcs=confidence] [data-gcs-confidence="__project"]');
  const sumText = await page.$eval('[data-gcs=confidence]', e => e.innerText.replace(/\s+/g, ' '));
  ok('Summary lists each tab and the project mix (5,600 total)', /Plant Section 1/.test(sumText) && /Plant Section 2/.test(sumText) && Math.abs(proj.EQD - 100 / 56) < 0.05, JSON.stringify(proj) + ' · ' + sumText.slice(0, 200));
  if (process.env.SHOT) { const el = await page.$('[data-gcs=confidence]'); await el.screenshot({ path: process.env.SHOT + '-summary.png' }); }
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})();
