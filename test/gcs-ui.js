// End-to-end checks of the GCS screens: markup levels, tab markup table, Custom %, automatic and
// overridden inflation/scaling, tab discount, options, and load-time conversion of old files.
// Usage: node test/gcs-ui.js <built.html>
const fs = require('fs'), os = require('os'), path = require('path'); const { launch, openApp } = require('./harness');
const html = process.argv[2];
const results = []; const ok = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); };
const num = s => parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
function gcsState() {
  const st = JSON.parse(JSON.stringify(base));
  st.gcsFormat = 1;
  st.project = { ...st.project, defaultDealer: 0, discountMitigation: 0, costingDate: '2026-11-17', plantFeed: 400, mAndE: 10, sAndAExpense: 10, segment: 'Crush (Preparation & Pressing)' };
  st.costingSheets = [{ id: 'main', name: 'Plant Section 1', segment: 'Liquids (Refining, Biodiesel, Oleochemicals)', provisions: { startupRisk: 0, fcaPacking: 0, c5Duty: 0, h1Duty: 0 } },
                      { id: 'opt', name: 'Option A', type: 'option', include: false, provisions: { startupRisk: 0, fcaPacking: 0, c5Duty: 0, h1Duty: 0 } }];
  st.items = [
    { id: 'L1', type: 'item', parentId: null, sheetId: 'main', partNumber: 'P1', description: 'Line 1', supplier: 'S', qty: 2, unitCost: 1000, ccy: 'USD', source: 'Quotation', margin: 0, discount: 0, leadTime: 5 },
    { id: 'L2', type: 'item', parentId: null, sheetId: 'opt', partNumber: 'P2', description: 'Opt 1', supplier: 'S', qty: 1, unitCost: 520, ccy: 'USD', source: 'Quotation', margin: 0, discount: 0, leadTime: 5 },
  ];
  return st;
}
const tabSales = page => page.$eval('[data-gcs=tab-settings]', e => (e.innerText.match(/Sales\s+([\d,\.]+)/) || [])[1]).then(num);
const headerTotal = page => page.$eval('.pcw-header-total', e => e.innerText).then(num);
(async () => {
  const b = await launch();
  // ── 1. markup levels and tab markup table ──
  let { page, errors } = await openApp(b, html, JSON.stringify(gcsState()), { extraStorage: { 'gcs-col-visibility': JSON.stringify({ costBasis: true, _gcsCostDateDefault: true, _gcsLeadTimeDefault: true, leadTime: false }) } });
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="L1-margins"]');
  ok('new line follows tab default CROWN (A) 48%', Math.abs(await tabSales(page) - 2000 / 0.52) < 0.01, await tabSales(page));
  await page.selectOption('[data-cell="L1-margins"]', 'CPM (B)'); await page.waitForTimeout(300);
  ok('choosing CPM (B) reprices: cost / (1 - 46.5%)', Math.abs(await tabSales(page) - 2000 / 0.535) < 0.01, await tabSales(page));
  await page.click('[data-gcs=tab-settings] > div'); await page.waitForTimeout(200);
  const cpmB = page.locator('[data-gcs=tab-settings] tr', { hasText: 'CPM (B)' }).locator('input');
  await cpmB.focus(); await page.waitForTimeout(120); await page.keyboard.press('Control+A'); await page.keyboard.type('50'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
  ok('editing CPM (B) to 50% in the tab table reprices the line', Math.abs(await tabSales(page) - 2000 / 0.5) < 0.01, await tabSales(page));
  await page.selectOption('[data-cell="L1-margins"]', 'CUSTOM'); await page.waitForTimeout(300);
  ok('switching to Custom keeps the price (margin copied)', Math.abs(await tabSales(page) - 2000 / 0.5) < 0.01, await tabSales(page));
  await page.focus('[data-cell="L1-margin"]'); await page.waitForTimeout(120); if(process.env.DBG)console.log('focus',await page.evaluate(()=>document.activeElement.getAttribute('data-cell'))); await page.keyboard.press('Control+A'); await page.keyboard.type('30'); if(process.env.DBG)console.log('typed',await page.evaluate(()=>document.activeElement.getAttribute('data-cell')+'='+document.activeElement.value)); await page.keyboard.press('Tab'); await page.waitForTimeout(900); if(process.env.DBG)console.log('after',await page.evaluate(()=>document.activeElement.getAttribute('data-cell')+'='+document.activeElement.value), await page.$eval('[data-cell="L1-margin"]',e=>e.value));
  ok('Custom 30% prices at cost / 0.7', Math.abs(await tabSales(page) - 2000 / 0.7) < 0.01, await tabSales(page));
  // ── 2. inflation and scaling ──
  await page.fill('[data-cell="L1-costDate"]', '2025-11-17'); await page.waitForTimeout(300);
  const inflVal = await page.$eval('[data-cell="L1-inflation"]', e => e.value);
  ok('cost date 12 months back gives automatic inflation 6.00%', num(inflVal) === 6, inflVal);
  ok('inflation applied to cost: 2000 x 1.06 / 0.7', Math.abs(await tabSales(page) - 2000 * 1.06 / 0.7) < 0.01, await tabSales(page));
  await page.focus('[data-cell="L1-inflation"]'); await page.waitForTimeout(120); await page.keyboard.press('Tab'); await page.waitForTimeout(250);
  const stillAuto = await page.$eval('[data-cell="L1-inflation"]', e => getComputedStyle(e).fontStyle);
  ok('tabbing through the inflation cell keeps it automatic', stillAuto === 'italic', stillAuto);
  await page.focus('[data-cell="L1-inflation"]'); await page.waitForTimeout(120); await page.keyboard.press('Control+A'); await page.keyboard.type('10'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
  ok('typed inflation 10% overrides', Math.abs(await tabSales(page) - 2000 * 1.10 / 0.7) < 0.01, await tabSales(page));
  await page.click('td:has([data-cell="L1-inflation"]) .pcw-gcs-reset'); await page.waitForTimeout(300);
  ok('reset returns to automatic 6%', Math.abs(await tabSales(page) - 2000 * 1.06 / 0.7) < 0.01, await tabSales(page));
  await page.focus('[data-cell="L1-size"]'); await page.waitForTimeout(120); await page.keyboard.press('Control+A'); await page.keyboard.type('100'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
  const scal = Math.pow(400 / 100, 0.6);
  ok('size 100 with plant feed 400 gives scaling (4)^0.6', Math.abs(await tabSales(page) - 2000 * scal * 1.06 / 0.7) < 0.01, `${await tabSales(page)} vs ${2000 * scal * 1.06 / 0.7}`);
  // ── 3. discount, options, contract value ──
  const salesNow = await tabSales(page);
  const discInput = page.locator('[data-gcs=tab-settings] input[placeholder]').first();
  await discInput.fill('5'); await discInput.press('Tab'); await page.waitForTimeout(300);
  const price = Math.ceil(salesNow / 1000) * 1000;
  ok('contract value = rounded tab price less 5% tab discount', Math.abs(await headerTotal(page) - price * 0.95) < 0.01, `${await headerTotal(page)} vs ${price * 0.95}`);
  await page.click('text=Option A'); await page.waitForTimeout(300);
  const optSettings = page.locator('[data-gcs=tab-settings]');
  if (!(await optSettings.innerText()).includes('Include in price')) await page.click('[data-gcs=tab-settings] > div');
  await page.check('[data-gcs=tab-settings] input[type=checkbox]'); await page.waitForTimeout(300);
  ok('including the option adds its rounded price (520/0.52=1000)', Math.abs(await headerTotal(page) - (price * 0.95 + 1000)) < 0.01, await headerTotal(page));
  await page.click('.pcw-nav .pcw-tab >> nth=4'); await page.waitForTimeout(400);
  const sumText = await page.$eval('[data-gcs=summary]', e => e.innerText);
  ok('summary shows EBITDA target from segment (Crush <$1m = 30%)', /Target\s+30\.00%/.test(sumText), sumText.match(/Target[^\n]*/)?.[0]);
  ok('no console errors (part 1)', errors.length === 0, errors.slice(0, 2));
  await page.context().close();
  // ── 4. old files: contingency folded once, levels after reload stay ──
  const old = JSON.parse(JSON.stringify(base)); delete old.gcsFormat;   // fixture 01: margin 30 / contingency 5 on line 1
  ({ page, errors } = await openApp(b, html, JSON.stringify(old), { extraStorage: { 'gcs-col-visibility': JSON.stringify({ costBasis: true, _gcsCostDateDefault: true, _gcsLeadTimeDefault: true, leadTime: false }) } }));
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForTimeout(400);
  const firstId = old.items.find(i => i.type !== 'heading').id;
  const m = await page.$eval(`[data-cell="${firstId}-margin"]`, e => e.value).catch(() => null);
  ok('old file: margin 30% + contingency 5% becomes Custom 33.50%', m && num(m) === 33.5, m);
  // add a new line (follows the tab default level), let the browser autosave, reload: the old line must stay Custom 33.5% and the new line must still follow the default
  await page.click('text=Add Item'); await page.waitForTimeout(400);
  const newId = await page.evaluate(() => { const c = [...document.querySelectorAll('[data-cell$="-margins"]')]; return c[c.length - 1].getAttribute('data-cell').replace('-margins', ''); });
  await page.waitForTimeout(31500); /* browser autosave runs ~30 s after the last change */ await page.reload(); await page.waitForSelector('.pcw-nav .pcw-tab');
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForTimeout(400);
  const m2 = await page.$eval(`[data-cell="${firstId}-margin"]`, e => e.value).catch(() => null);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gcs-state-v1') || '{}').gcsFormat);
  const lvl = await page.$eval(`[data-cell="${newId}-margins"]`, e => e.value).catch(() => 'missing');
  ok('after autosave + reload: old line still 33.50%, new line still follows the default, file marked converted', m2 && num(m2) === 33.5 && saved === 1 && lvl === '', `${m2} format=${saved} newLevel=${JSON.stringify(lvl)}`);
  // .pcw upload
  const tmp = path.join(os.tmpdir(), 'parts-quote.pcw'); fs.writeFileSync(tmp, JSON.stringify(old));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=Upload')]);
  await chooser.setFiles(tmp); await page.waitForTimeout(1200);
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForTimeout(400);
  const m3 = await page.$eval(`[data-cell="${firstId}-margin"]`, e => e.value).catch(() => null);
  ok('uploaded PCW .pcw file is converted the same way', m3 && num(m3) === 33.5, m3);
  ok('no console errors (part 2)', errors.length === 0, errors.slice(0, 2));
  await b.close();
  results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '  → ' + JSON.stringify(r.detail)}`));
  const f = results.filter(r => !r.pass).length; console.log(f ? `${f} FAILED` : `ALL ${results.length} PASS`); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
