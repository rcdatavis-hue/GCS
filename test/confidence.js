// Costing confidence: cost-weighted source score (PCW SOURCE_SCORE) per tab and project, in Tab settings, Summary and header.
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
  L('X', 's2', { unitCost: 100, source: 'EQD' }), L('I', 's2', { unitCost: 0, source: 'Item Cost Use Guidance' })];
(async () => {
  const b = await launch(); const { page, errors } = await openApp(b, html, JSON.stringify(st));
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="Q-partNo"]');
  const parts = sel => page.$$eval(`${sel} [data-conf-part]`, els => Object.fromEntries(els.map(e => [e.getAttribute('data-conf-part'), +e.getAttribute('data-conf-pct')])));
  const rate = sel => page.$eval(sel, e => ({ rate: +e.getAttribute('data-conf-rate'), label: e.getAttribute('data-conf-label'), tip: e.title }));
  const t1 = await rate('[data-gcs=tab-settings] [data-gcs-confidence="tab"]');
  // cost 5,500: Quotation 1,000 (5) + Project Cost 3,000 (3) + Estimate 1,000 (2) + no source 500 (0) = 2.909 / 5
  ok('tab 1 rate = cost-weighted source score 58.2%, Medium', Math.abs(t1.rate - 2.90909 / 5 * 100) < 0.05 && t1.label === 'Medium', JSON.stringify(t1).slice(0, 160));
  ok('tooltip explains the weights and shares', /Quotation \(score 5\): 18\.18%/.test(t1.tip) && /No source \(score 0\)/.test(t1.tip), t1.tip);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '-tab.png', clip: { x: 0, y: 0, width: 1600, height: 270 } });
  await page.click('text=Plant Section 2'); await page.waitForSelector('[data-cell="X-partNo"]'); await page.waitForTimeout(200);
  const t2 = await rate('[data-gcs=tab-settings] [data-gcs-confidence="tab"]');
  const opts = id => page.$eval(`[data-cell="${id}-source"]`, e => [...e.options].map(o => o.value));
  const oX = await opts('X'), oI = await opts('I');
  ok('ICUG hidden from the Source list; a line already on ICUG keeps it', !oX.includes('Item Cost Use Guidance') && oX.includes('EQD') && oI.includes('Item Cost Use Guidance'), oX.join(',') + ' / ' + oI.join(','));
  ok('no Item Cost Use Guidance estimate buttons', !(await page.$('text=Apply Est.')) && !(await page.$('text=✦ Est')));
  ok('tab 2 is its own (EQD only: 60%, Medium)', t2.rate === 60 && t2.label === 'Medium', JSON.stringify(t2).slice(0, 80));
  const hdr = await page.evaluate(() => [...document.querySelectorAll('span')].find(e => e.textContent === 'Cost Confidence:').parentElement.innerText);
  ok('header Cost Confidence uses the same project score (Medium)', /Medium/.test(hdr), hdr);
  await page.click('.pcw-nav .pcw-tab >> text=Summary'); await page.waitForSelector('[data-gcs=confidence]');
  const proj = await rate('[data-gcs=confidence] [data-gcs-confidence="__project"]');
  const sumText = await page.$eval('[data-gcs=confidence]', e => e.innerText.replace(/\s+/g, ' '));
  ok('Summary: each tab and the project (16,300 / 5,600 = 2.911 → 58.2%)', /Plant Section 1/.test(sumText) && /Plant Section 2/.test(sumText) && Math.abs(proj.rate - 16300 / 5600 / 5 * 100) < 0.05, proj.rate + ' · ' + sumText.slice(0, 220));
  if (process.env.SHOT) { const el = await page.$('[data-gcs=confidence]'); await el.screenshot({ path: process.env.SHOT + '-summary.png' }); }
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})();
