// EQD (Equipment Quotations Database) end to end with a feed holding the real EQD sheet.
// Usage: node test/eqd-ui.js <built.html> <feed-with-EQD.xlsx>
const fs = require('fs'); const { launch, openApp } = require('./harness');
const [, , html, feedFile] = process.argv;
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });
const num = s => parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
const st = JSON.parse(JSON.stringify(base)); st.gcsFormat = 1;
st.project = { ...st.project, segment: 'Liquids (Refining, Biodiesel, Oleochemicals)', plantFeed: 400, costingDate: '2026-11-19', defaultDealer: 0, discountMitigation: 0, ratesRefreshedAt: null };
st.costingSheets = [{ id: 'main', name: 'Plant Section 1' }];
const L = (id, extra) => ({ id, type: 'item', parentId: null, sheetId: 'main', partNumber: '', description: '', supplier: '', qty: 1, unitCost: 0, ccy: 'USD', source: '', ...extra });
st.items = [L('E1'), L('N1', { partNumber: 'X1', description: 'Typed line', supplier: 'S', unitCost: 1000, source: 'Quotation', sizeCapacity: 100 }), L('C1')];
const feed = fs.readFileSync(feedFile).toString('base64');

(async () => {
  const b = await launch();
  const { page, errors } = await openApp(b, html, JSON.stringify(st), { extraStorage: { 'gcs-col-visibility': JSON.stringify({ costBasis: true, _gcsCostDateDefault: true, _gcsLeadTimeDefault: true, leadTime: false, _gcsLineDiscountDefault: true }) } });
  await page.evaluate(b64 => {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const handle = { kind: 'file', name: 'PCW_Feed.xlsx', getFile: async () => new File([bin], 'PCW_Feed.xlsx', { lastModified: Date.now() }), queryPermission: async () => 'granted', requestPermission: async () => 'granted' };
    window.showOpenFilePicker = async () => [handle];
  }, feed);
  await page.$eval('[data-feed-pill]', e => e.click());
  await page.waitForFunction(() => /all sheets loaded/i.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="E1-partNo"]');
  ok('Liquids project: EQD and scaling columns shown', !!(await page.$('[data-cell="E1-eqd"]')) && !!(await page.$('[data-cell="E1-scaling"]')));
  const nScale = await page.$eval('[data-cell="N1-scaling"]', e => e.value);
  ok('scaling only on EQD lines: a typed line with a size stays 1.00×', num(nScale) === 1, nScale);
  // picker
  const t0 = Date.now();
  await page.click('[data-eqd-open="E1"]'); await page.waitForSelector('[data-eqd-picker="E1"] [data-eqd-filter="equipment"]', { timeout: 60000 });
  const loadMs = Date.now() - t0;
  const info = await page.evaluate(async () => { const db = await DataService.getEqd(); return { n: db.records.length, segs: [...new Set(db.records.map(r => r.equipment))].length }; });
  ok('EQD sheet read: Liquids quotes only', info.n > 4000 && info.n < 6000, `${info.n} quotes, ${info.segs} equipment names, picker ${loadMs} ms`);
  const sel = { equipment: 'Cake Discharge Valve', material: 'Carbon Steel', size: '30', vendor: 'ABZ' };
  for (const k of ['equipment', 'material', 'size', 'vendor']) { await page.selectOption(`[data-eqd-picker="E1"] [data-eqd-filter="${k}"]`, sel[k]); await page.waitForTimeout(120); }
  const expect = await page.evaluate(async s => { const db = await DataService.getEqd(); const r = gcsEqdLatest(db.records, { ...s, size: Number(s.size) }); return r; }, sel);
  const rows = await page.$$eval('[data-eqd-picker="E1"] [data-eqd-quote]', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
  ok('cascading choices narrow to matching quotes, newest first', rows.length >= 1 && rows[0].includes(expect.date), rows.slice(0, 3).join(' | '));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '-picker.png' });
  await page.click('[data-eqd-picker="E1"] [data-eqd-quote] >> nth=0'); await page.waitForTimeout(400);
  const line = await page.evaluate(() => { const v = id => (document.querySelector(`[data-cell="E1-${id}"]`) || {}).value; return { cost: v('unitCost'), part: v('partNo'), sup: v('supplier'), date: v('costDate'), scale: v('scaling'), size: v('size'), src: (document.querySelector('[data-cell="E1-source"]') || {}).value, loc: (document.querySelector('[data-cell="E1-costLoc"]') || {}).innerText, eqd: (document.querySelector('[data-cell="E1-eqd"]') || {}).innerText }; });
  ok('latest quote fills cost, SAP, vendor, quote date, size; source EQD', Math.abs(num(line.cost) - expect.price) < 0.01 && line.part === String(expect.sap) && line.sup === 'ABZ' && line.date === expect.date && num(line.size) === 30 && line.src === 'EQD', JSON.stringify(line));
  ok('automatic scaling on the EQD line: (400/30)^0.6', Math.abs(num(line.scale) - Math.pow(400 / 30, 0.6)) < 0.01, line.scale);
  ok('Cost Source shows EQD; EQD cell shows the selection', /EQD/.test(line.loc) && /Cake Discharge Valve/.test(line.eqd), line.loc + ' / ' + line.eqd);
  // feed refresh never overwrites an EQD line
  const guard = await page.evaluate(() => gcsCostFillPatch({ eqd: { equipment: 'X' }, unitCost: 5, ccy: 'USD' }, { unitCost: 9, date: '2026-01-01', bu: 'CIW', status: 'Purchase Order' }, null, { force: true }));
  ok('latest-cost autofill and refresh leave EQD lines alone', guard === null);
  // clear
  await page.click('[data-eqd-open="E1"]'); await page.waitForSelector('[data-eqd-clear="E1"]'); await page.click('[data-eqd-clear="E1"]'); await page.waitForTimeout(300);
  const cleared = await page.evaluate(() => ({ cost: document.querySelector('[data-cell="E1-unitCost"]').value, part: document.querySelector('[data-cell="E1-partNo"]').value, eqd: document.querySelector('[data-cell="E1-eqd"]').innerText, scale: document.querySelector('[data-cell="E1-scaling"]').value }));
  ok('Clear EQD restores the line (blank) and scaling returns to 1.00', num(cleared.cost) === 0 && cleared.part === '' && /EQD/.test(cleared.eqd) && num(cleared.scale) === 1, JSON.stringify(cleared));
  // non-app currency (CNY) converts at the feed rate
  const cny = await page.evaluate(async () => { const db = await DataService.getEqd(); return db.records.find(r => r.ccy === 'CNY' && r.material && r.vendor && r.size !== ''); });
  await page.click('[data-eqd-open="C1"]'); await page.waitForSelector('[data-eqd-picker="C1"] [data-eqd-filter="equipment"]');
  for (const [k, v] of [['equipment', cny.equipment], ['material', cny.material], ['size', String(cny.size)], ['vendor', cny.vendor]]) { await page.selectOption(`[data-eqd-picker="C1"] [data-eqd-filter="${k}"]`, v); await page.waitForTimeout(120); }
  await page.click(`[data-eqd-picker="C1"] [data-eqd-quote="${cny.id}"]`); await page.waitForTimeout(300);
  const c1 = await page.evaluate(() => ({ cost: document.querySelector('[data-cell="C1-unitCost"]').value, ccy: document.querySelector('tr[data-item-id="C1"] select.pcw-ms').value }));
  ok('CNY quote converted to USD at the feed rate (7.2 per USD)', c1.ccy === 'USD' && Math.abs(num(c1.cost) - cny.price / 7.2) < 0.02, `${cny.price} CNY → ${c1.cost} ${c1.ccy}`);
  // EQD Search: add lines
  await page.click('[data-eqd=open]'); await page.waitForSelector('[data-eqd=panel] [data-eqd-filter="equipment"]');
  await page.selectOption('[data-eqd=panel] [data-eqd-filter="equipment"]', 'Cake Discharge Valve'); await page.waitForTimeout(200);
  await page.click('[data-eqd=panel] [data-eqd-quote] >> nth=0'); await page.click('[data-eqd=panel] [data-eqd-quote] >> nth=1');
  await page.selectOption('[data-eqd=dest-pos]', 'E1');
  await page.click('[data-eqd=import]'); await page.waitForSelector('[data-eqd=result]');
  const res = await page.$eval('[data-eqd=result]', e => e.innerText);
  await page.click('[data-eqd=close]'); await page.waitForTimeout(300);
  const order = await page.$$eval('tr[data-item-id]', els => els.map(e => e.getAttribute('data-item-id')));
  const srcs = await page.$$eval('[data-cell$="-source"]', els => els.map(e => e.value));
  ok('EQD Search adds the chosen quotes as EQD lines after the chosen line', /Added 2 lines/.test(res) && order.length === 5 && order[0] === 'E1' && order[3] === 'N1' && srcs.filter(s => s === 'EQD').length === 3, `${res} · ${order.join(',')} · ${srcs.join(',')}`);
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})();
