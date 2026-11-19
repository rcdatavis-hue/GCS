// Quote readiness: per tab, PASS counts as a markup, bar colours (red <33, amber 33-65, light green 66-99, green 100),
// row tick and tooltip agree.  Usage: node test/readiness.js <built.html>
const fs = require('fs'); const { launch, openApp } = require('./harness');
const html = process.argv[2];
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
const st = JSON.parse(JSON.stringify(base)); st.gcsFormat = 1;
st.costingSheets = [{ id: 'main', name: 'Plant Section 1' }, { id: 's2', name: 'Plant Section 2' }, { id: 's3', name: 'Plant Section 3' }];
const L = (id, sheetId, extra) => ({ id, type: 'item', parentId: null, sheetId, partNumber: 'P' + id, description: 'd' + id, supplier: 'S', qty: 1, unitCost: 100, ccy: 'USD', source: 'Quotation', ...extra });
st.items = [L('A', 'main'), L('B', 's2', { markupLevel: 'PASS' }), L('C', 's2', { supplier: '' }), L('D', 's2', { markupLevel: 'CUSTOM', margin: 0 }), L('E', 's3', { unitCost: 0 })];
(async () => {
  const b = await launch(); const { page, errors } = await openApp(b, html, JSON.stringify(st));
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="A-partNo"]');
  const bar = () => page.evaluate(() => { const p = document.querySelector('[data-readiness]'); if (!p) return null; const box = p.closest('div[style*="border-radius: 8px"]') || p.parentElement.parentElement.parentElement; const fill = box.querySelector('div[style*="width:"] > div') || [...box.querySelectorAll('div')].find(d => /%$/.test(d.style.width)); return { pct: +p.getAttribute('data-readiness'), text: box.innerText.replace(/\s+/g, ' '), fill: fill ? getComputedStyle(fill).backgroundColor : '', width: fill ? fill.style.width : '' }; });
  const tick = id => page.$eval(`tr:has([data-cell="${id}-partNo"]) span[title*="ready to quote"], tr:has([data-cell="${id}-partNo"]) span[title*="Ready to quote"]`, e => e.innerText + ' ' + e.title).catch(() => '');
  const b1 = await bar();
  ok('tab 1: 1 of 1, green', b1 && b1.pct === 100 && /Plant Section 1/.test(b1.text) && b1.fill === 'rgb(22, 163, 74)', JSON.stringify(b1));
  await page.click('text=Plant Section 2'); await page.waitForSelector('[data-cell="B-partNo"]'); await page.waitForTimeout(200);
  const b2 = await bar();
  ok('tab 2 counted on its own: 1 of 3 = 33%, amber', b2 && b2.pct === 33 && /1 of 3/.test(b2.text) && b2.fill === 'rgb(245, 158, 11)', JSON.stringify(b2));
  const tB = await tick('B'), tC = await tick('C'), tD = await tick('D');
  ok('PASS markup counts as set (tick)', /^✓/.test(tB), tB);
  ok('missing supplier: not ready, tooltip says supplier', /^○/.test(tC) && /supplier/.test(tC) && !/markup/.test(tC), tC);
  ok('Custom 0%: not ready, tooltip says markup', /^○/.test(tD) && /markup/.test(tD), tD);
  await page.click('text=Plant Section 3'); await page.waitForSelector('[data-cell="E-partNo"]'); await page.waitForTimeout(200);
  const b3 = await bar();
  ok('0% shows a red bar label (was invisible grey)', b3 && b3.pct === 0 && /0 of 1/.test(b3.text), JSON.stringify(b3));
  const col = await page.evaluate(() => [0, 32, 33, 65, 66, 99, 100].map(gcsReadinessColor).join(','));
  ok('colour bands', col === '#dc2626,#dc2626,#f59e0b,#f59e0b,#65a30d,#65a30d,#16a34a', col);
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})();
