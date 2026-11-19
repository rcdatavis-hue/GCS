// Automatic cost from the feed regardless of business unit, with the cost source location shown.
// The feed is simulated by seeding the feed module's sheet cache (PO, PQ, pricelist rows as the parser gives them).
// Usage: node test/cost-source.js <built.html>
const fs = require('fs'); const { launch, openApp } = require('./harness');
const html = process.argv[2];
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
const st = JSON.parse(JSON.stringify(base)); st.gcsFormat = 1;
st.project = { ...st.project, bu: 'CIW', costingDate: '2026-11-19' };
st.costingSheets = [{ id: 'main', name: 'Plant Section 1' }];
st.items = ['L1', 'L2', 'L3', 'L4'].map(id => ({ id, type: 'item', parentId: null, sheetId: 'main', partNumber: '', description: '', supplier: '', qty: 1, unitCost: 0, ccy: 'USD', source: '' }));
st.items[3].unitCost = 999; st.items[3].source = 'Quotation';   // typed cost
const FEED = {
  purchaseOrders: [
    { itemNo: 'P-ECL', unitPrice: 500, date: '2025-11-01', supplierName: 'Euro Fab', poNo: '4500001', qty: 2, db: 'ECL_LIVE' },
    { itemNo: 'P-ECL', unitPrice: 0, date: '2026-05-01', supplierName: 'Zero Ltd', poNo: '4500009', qty: 1, db: 'CIT' },
    { itemNo: 'P-BOTH', unitPrice: 300, date: '2026-01-15', supplierName: 'Cit Steel', poNo: '4500002', qty: 1, db: 'CIT' },
    { itemNo: 'P-TYPED', unitPrice: 10, date: '2026-01-15', supplierName: 'X', poNo: '4500003', qty: 1, db: 'CIW' },
  ],
  purchaseQuotes: [
    { itemNo: 'P-ECL', unitPrice: 450, date: '2025-06-01', supplierName: 'Old Quote Co', docNum: 'PQ77', qty: 1, db: 'CIW' },
    { itemNo: 'P-BOTH', unitPrice: 320, date: '2026-01-15', supplierName: 'Same Day PQ', docNum: 'PQ78', qty: 1, db: 'CIA' },
  ],
  pricelists: [
    { itemNo: 'P-PL', ciwCost: '', ciwMargin: '', eclCost: 80, eclMargin: 0.3 },
    { itemNo: 'P-BOTH', ciwCost: 250, ciwMargin: 0.4 },
  ],
};

(async () => {
  const b = await launch();
  const { page, errors } = await openApp(b, html, JSON.stringify(st));
  await page.evaluate(FEED => { DataService.__seedSheets(FEED); DataService.isConnected = () => true; }, FEED);
  // engine
  const eng = await page.evaluate(async () => {
    const a = await DataService.getLatestCost('p-ecl'), c = await DataService.getLatestCost('P-BOTH'), n = await DataService.getLatestCost('NOPE');
    const auto = gcsCostFillPatch({ unitCost: 500, ccy: 'USD', _autoCost: true, costLocation: 'ECL', costRef: { type: 'Purchase Order', bu: 'ECL', cost: 500 } }, null, null, { clearIfNone: true });
    const typed = gcsCostFillPatch({ unitCost: 7, ccy: 'USD' }, a, null, {});
    const forced = gcsCostFillPatch({ unitCost: 7, ccy: 'USD' }, a, null, { force: true });
    const stale = gcsCostProvenance({ unitCost: 600, ccy: 'USD', costLocation: 'ECL', costRef: { bu: 'ECL', cost: 500 } });
    return { a, c, n, auto, typed, forced, stale };
  });
  ok('latest positive cost across BUs (ECL PO beats older CIW PQ; zero-cost CIT PO ignored)', eng.a && eng.a.unitCost === 500 && eng.a.bu === 'ECL' && eng.a.status === 'Purchase Order', JSON.stringify(eng.a));
  ok('same date: PO preferred over PQ', eng.c && eng.c.docNo === '4500002' && eng.c.bu === 'CIT', JSON.stringify(eng.c));
  ok('no history → null', eng.n === null);
  ok('typed cost not overwritten; refresh with "overwrite" does', eng.typed === null && eng.forced && eng.forced.unitCost === 500, JSON.stringify(eng.forced && eng.forced.costLocation));
  ok('refresh removes an automatic cost the feed no longer has', eng.auto && eng.auto.unitCost === 0 && eng.auto.costLocation === '');
  ok('provenance hidden once the cost no longer matches', eng.stale === null);
  // UI: type part numbers
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="L1-partNo"]');
  const enter = async (id, pn) => { await page.click(`[data-cell="${id}-partNo"]`); await page.keyboard.type(pn); await page.keyboard.press('Tab'); await page.waitForTimeout(500); };
  await enter('L1', 'P-ECL'); await enter('L2', 'P-PL'); await enter('L3', 'P-BOTH'); await enter('L4', 'P-TYPED');
  const row = id => page.evaluate(id => ({ cost: document.querySelector(`[data-cell="${id}-unitCost"]`).value, loc: (document.querySelector(`[data-cell="${id}-costLoc"]`) || {}).innerText, tip: (document.querySelector(`[data-cell="${id}-costLoc"] button`) || {}).title || '', date: document.querySelector(`[data-cell="${id}-costDate"]`).value, sup: (document.querySelector(`[data-cell="${id}-supplier"]`) || {}).value }), id);
  const r1 = await row('L1'), r2 = await row('L2'), r3 = await row('L3'), r4 = await row('L4');
  ok('other-BU PO fills cost, date, supplier; Cost Source shows ECL · PO', /500/.test(r1.cost) && /ECL\s*PO/.test(r1.loc) && r1.date === '2025-11-01' && r1.sup === 'Euro Fab' && /4500001/.test(r1.tip), JSON.stringify(r1));
  ok('pricelist-only part keeps the pricelist cost and shows its BU (ECL · PL)', /80/.test(r2.cost) && /ECL\s*PL/.test(r2.loc), JSON.stringify(r2));
  ok('PO/PQ cost takes priority over the pricelist', /300/.test(r3.cost) && /CIT\s*PO/.test(r3.loc), JSON.stringify(r3));
  ok('typed cost left alone, no source location', /999/.test(r4.cost) && /—/.test(r4.loc), JSON.stringify(r4));
  // typing over an automatic cost clears the location
  await page.focus('[data-cell="L1-unitCost"]'); await page.waitForTimeout(120); await page.keyboard.press('Control+A'); await page.keyboard.type('650'); await page.keyboard.press('Tab'); await page.waitForTimeout(400);
  const r1b = await row('L1');
  ok('typed cost over an automatic one clears the location', /650/.test(r1b.cost) && /—/.test(r1b.loc), JSON.stringify(r1b));
  // the badge opens the cost history
  await page.click('[data-cell="L3-costLoc"] button'); await page.waitForTimeout(300);
  const pop = await page.evaluate(() => document.body.innerText);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '-history.png' });
  ok('badge opens the cost history with the other BUs already shown', /P-BOTH/.test(pop) && /Cit Steel/.test(pop) && /CIT/.test(pop), pop.slice(pop.indexOf('P-BOTH'), pop.indexOf('P-BOTH') + 200));
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})();
