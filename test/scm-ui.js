// End-to-end SCM Search: simulated synced folder (Commercial Costing Program/ with the master index and
// "Sales Cost Models (Test)/<model>.xlsx"), filters, basket, destination tab + position, import, feed costs.
// Usage: node test/scm-ui.js <built.html> <SCM_Master_Index.xlsm> <model.xlsx>
const fs = require('fs'); const { launch, openApp } = require('./harness');
const [, , html, indexFile, modelFile] = process.argv;
const MODEL_ID = 'Crush_Extraction_Shea_Nut_300MTPD_Extraction_Model_III_Extractor_Crown_Series_903_10401649';
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
const st = JSON.parse(JSON.stringify(base)); st.gcsFormat = 1;
st.costingSheets = [{ id: 'main', name: 'Plant Section 1' }, { id: 's2', name: 'Plant Section 2' }];
st.items = [
  { id: 'A', type: 'item', parentId: null, sheetId: 'main', partNumber: 'PA', description: 'First', qty: 1, unitCost: 10, ccy: 'USD', source: 'Quotation' },
  { id: 'B', type: 'item', parentId: null, sheetId: 's2', partNumber: 'PB', description: 'Tab 2 first', qty: 1, unitCost: 10, ccy: 'USD', source: 'Quotation' },
  { id: 'C', type: 'item', parentId: null, sheetId: 's2', partNumber: 'PC', description: 'Tab 2 last', qty: 1, unitCost: 10, ccy: 'USD', source: 'Quotation' }];
const files = { index: fs.readFileSync(indexFile).toString('base64'), model: fs.readFileSync(modelFile).toString('base64') };

(async () => {
  const b = await launch();
  const { ctx, page, errors } = await openApp(b, html, JSON.stringify(st));
  // Fake File System Access folder built from the real files
  await page.evaluate(({ files, MODEL_ID }) => {
    const bin = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const file = (name, b64, t) => ({ kind: 'file', name, getFile: async () => new File([bin(b64)], name, { lastModified: t }) });
    const dir = (name, kids) => ({ kind: 'directory', name, queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      async *entries() { for (const k of kids) yield [k.name, k]; } });
    const models = dir('Sales Cost Models (Test)', [file(MODEL_ID + '.xlsx', files.model, Date.parse('2026-08-11T11:59:00Z'))]);
    const root = dir('Commercial Costing Program', [file('SCM_Master_Index_v1.xlsm', files.index, Date.now()), models]);
    window.showDirectoryPicker = async () => root;
    // Feed: one PO for the root SAP item only
    DataService.isConnected = () => true;
    // PO for the root SAP item from another BU (costs fill regardless of BU)
    DataService.__seedSheets({ purchaseOrders: [{ itemNo: '10401649', unitPrice: 45000, date: '2026-03-01', supplierName: 'Acme Fab', poNo: 'PO123', qty: 1, db: 'ECL' }], purchaseQuotes: [] });
  }, { files, MODEL_ID });
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForTimeout(300);
  // Focus a line on tab 2 so the default position is "after" it
  await page.click('text=Plant Section 2'); await page.waitForTimeout(300);
  await page.focus('[data-cell="B-partNo"]'); await page.waitForTimeout(100);
  await page.click('[data-scm=open]'); await page.waitForSelector('[data-scm=panel]');
  ok('panel opens with no library', /No SCM library/.test(await page.$eval('[data-scm=source]', e => e.innerText)));
  const t0 = Date.now(); await page.click('[data-scm=pick]');
  await page.waitForFunction(() => /models/.test(document.querySelector('[data-scm=source]').innerText), null, { timeout: 30000 });
  const src = await page.$eval('[data-scm=source]', e => e.innerText);
  ok('choosing the folder loads the master index', /605 models/.test(src) && /Commercial Costing Program/.test(src), `${src} (${Date.now() - t0} ms)`);
  const count = async () => parseInt(await page.$eval('[data-scm=count]', e => e.innerText));
  ok('all models listed before filtering', (await count()) === 605, await count());
  await page.fill('[data-scm-filter=keyword]', 'shea'); await page.waitForTimeout(200);
  const nShea = await count();
  await page.selectOption('[data-scm-filter=rate]', '300MTPD'); await page.waitForTimeout(200);
  ok('keyword + Rate filters narrow the list', nShea > 0 && (await count()) <= nShea && (await count()) > 0, `${nShea} → ${await count()}`);
  await page.fill('[data-scm-filter=keyword]', ''); await page.selectOption('[data-scm-filter=rate]', '');
  await page.fill('[data-scm-filter=drawing]', 'F903-132'); await page.waitForTimeout(200);
  const md = await page.$eval('tbody tr td:nth-child(14)', e => e.innerText).catch(() => '');
  ok('drawing search shows the matched line', /F903-132/.test(md), md);
  await page.click('[data-scm=clear]'); await page.fill('[data-scm-filter=rootSap]', '10401649'); await page.waitForTimeout(200);
  await page.click(`[data-scm-row="${MODEL_ID}"]`);
  const bc = await page.$eval('[data-scm=basket-count]', e => e.innerText);
  ok('row click adds the model to the basket', /1 model · 57 lines/.test(bc), bc);
  ok('Draft model warning shown', /not Approved \(Draft\)/.test(await page.$eval('[data-scm=basket]', e => e.innerText)));
  ok('destination defaults to the active tab and focused line', (await page.$eval('[data-scm=dest-sheet]', e => e.value)) === 's2' && (await page.$eval('[data-scm=dest-pos]', e => e.value)) === 'B',
    (await page.$eval('[data-scm=dest-sheet]', e => e.value)) + ' / ' + (await page.$eval('[data-scm=dest-pos]', e => e.value)));
  await page.click('[data-scm=import]');
  await page.waitForSelector('[data-scm=result]', { timeout: 30000 });
  const res = await page.$eval('[data-scm=result]', e => e.innerText);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '-panel.png' });
  ok('import summary', /Imported 1 model, 57 lines/.test(res) && /1 costed/.test(res), res);
  await page.click('[data-scm=close]'); await page.waitForTimeout(400);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '-tab.png' });
  // Inspect saved state after autosave via the in-memory DOM: read item rows in order on tab 2
  const order = await page.$$eval('[data-cell$="-partNo"]', els => els.map(e => e.value || e.innerText));
  ok('lines land after the focused line, before the next one', order[0] === 'PB' && order[1] === '10401649' && order[order.length - 1] === 'PC' && order.length === 59, `${order.length} rows: ${order.slice(0, 3).join(',')} … ${order.slice(-1)}`);
  ok('model heading line inserted', (await page.content()).includes('SCM: Model III Extractor (Crown Series 903)'));
  const firstImported = await page.$$eval('[data-cell$="-unitCost"]', els => els.map(e => e.value));
  ok('root SAP item costed from the feed (45,000)', firstImported.some(v => /45,?000/.test(v)), firstImported.slice(0, 3).join(' | '));
  const locs = await page.$$eval('[data-cost-loc]', els => els.map(e => e.getAttribute('data-cost-loc')));
  ok('its cost source location (ECL) is shown', locs.length === 1 && locs[0] === 'ECL', locs.join(','));
  const tab1 = await (async () => { await page.click('text=Plant Section 1'); await page.waitForTimeout(300); return page.$$eval('[data-cell$="-partNo"]', els => els.map(e => e.value)); })();
  ok('other tab untouched', tab1.length === 1 && tab1[0] === 'PA', tab1.join(','));
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})();
