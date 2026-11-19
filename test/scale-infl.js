// Scaling column: hidden unless a Liquids segment is selected. Inflation traffic light: <5% green, 5-10% amber, 10%+ red.
// Usage: node test/scale-infl.js <built.html>
const fs = require('fs'); const { launch, openApp } = require('./harness');
const html = process.argv[2];
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
const mk = (segment, tabSegment) => { const st = JSON.parse(JSON.stringify(base)); st.gcsFormat = 1;
  st.project = { ...st.project, costingDate: '2026-11-19', segment };
  st.costingSheets = [{ id: 'main', name: 'Plant Section 1', ...(tabSegment ? { segment: tabSegment } : {}) }];
  const L = (id, extra) => ({ id, type: 'item', parentId: null, sheetId: 'main', partNumber: id, description: id, supplier: 'S', qty: 1, unitCost: 100, ccy: 'USD', source: 'Quotation', ...extra });
  st.items = [L('G', { costDate: '2026-10-19' }), L('A', { costDate: '2025-11-19' }), L('R', { costDate: '2024-11-19' }), L('T', { inflationPct: 10 }), L('N', {}), L('E', { costDate: '2026-05-19' }), L('F', { costDate: '2026-01-19' })];
  return JSON.stringify(st); };
(async () => {
  const b = await launch();
  let { page, errors, ctx } = await openApp(b, html, mk('Crush (Extraction)'));
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="G-partNo"]');
  ok('Crush project: scaling column hidden', !(await page.$('[data-cell="G-scaling"]')) && !(await page.$('th[data-col-key="scaleAdj"]')));
  ok('inflation column still shown; size moved out of Cost Date', !!(await page.$('[data-cell="G-inflation"]')) && !(await page.$('[data-cell="G-size"]')));
  const bands = await page.evaluate(() => Object.fromEntries(['G', 'A', 'R', 'T', 'N', 'E', 'F'].map(id => { const e = document.querySelector(`[data-cell="${id}-inflation"]`); return [id, e.getAttribute('data-infl-band') + ' ' + e.value + ' ' + getComputedStyle(e).backgroundColor]; })));
  ok('0.5% → green', /^green/.test(bands.G), bands.G);
  ok('6% → amber', /^amber/.test(bands.A), bands.A);
  ok('12% → red', /^red/.test(bands.R), bands.R);
  ok('typed 10% → red (10%+)', /^red/.test(bands.T), bands.T);
  ok('3% (6 months) → green', /^green/.test(bands.E), bands.E);
  ok('exactly 5% (10 months) → amber', /^amber 5\.00/.test(bands.F), bands.F);
  ok('no cost date → no colour', /^ /.test(bands.N), bands.N);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '-infl.png' });
  ok('cost date column hidden by default', !(await page.$('[data-cell="G-costDate"]')) && !(await page.$('th[data-col-key="costBasis"]')));
  await page.selectOption('[data-cell="G-category"]', 'C5'); await page.waitForTimeout(200);
  const cat = await page.$eval('[data-cell="G-category"]', e => ({ shown: e.options[e.selectedIndex].text, title: e.title, width: e.getBoundingClientRect().width, group: e.options[e.selectedIndex].parentElement.label }));
  ok('category shows the code only (name in tooltip and group heading)', cat.shown === 'C5' && /Crown Free-Issue Parts/.test(cat.title) && /^C /.test(cat.group) && cat.width <= 50, JSON.stringify(cat));
  // change a tab's segment to Liquids → column appears
  await page.click('[data-gcs=tab-settings] > div'); await page.waitForTimeout(200);
  const segSel = page.locator('[data-gcs=tab-settings] select').filter({ has: page.locator('option', { hasText: 'Liquids (Refining' }) }).first();
  await segSel.selectOption({ label: 'Liquids (Refining, Biodiesel, Oleochemicals)' }).catch(async () => { await segSel.selectOption('Liquids (Refining, Biodiesel, Oleochemicals)'); });
  await page.waitForTimeout(400);
  ok('choosing a Liquids segment on a tab shows the scaling column', !!(await page.$('[data-cell="G-scaling"]')) && !!(await page.$('[data-cell="G-size"]')));
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
  ({ page, errors, ctx } = await openApp(b, html, mk('Liquids (Renewable Diesel Pretreatment)')));
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="G-partNo"]');
  ok('Liquids project: scaling column shown on load', !!(await page.$('[data-cell="G-scaling"]')) && !!(await page.$('th[data-col-key="scaleAdj"]')));
  await ctx.close(); await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})();
