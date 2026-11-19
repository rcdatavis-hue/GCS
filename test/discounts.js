// Discounts & commissions in the GCS Costing Method card, project discount editable on Summary, per-line Discount %
// hidden by default (shown when the project uses line discounts).  Usage: node test/discounts.js <built.html>
const fs = require('fs'); const { launch, openApp } = require('./harness');
const html = process.argv[2];
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });
const num = s => parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
const mk = lineDisc => { const st = JSON.parse(JSON.stringify(base)); st.gcsFormat = 1; st.project = { ...st.project, defaultDealer: 0, discountMitigation: 0, gcsDiscount: 0 };
  st.costingSheets = [{ id: 'main', name: 'Plant Section 1' }];
  st.items = [{ id: 'A', type: 'item', parentId: null, sheetId: 'main', partNumber: 'PA', description: 'a', supplier: 'S', qty: 1, unitCost: 5200, ccy: 'USD', source: 'Quotation', discount: lineDisc }];
  return JSON.stringify(st); };
(async () => {
  const b = await launch();
  let { page, errors, ctx } = await openApp(b, html, mk(0));
  await page.click('.pcw-nav .pcw-tab >> nth=0'); await page.waitForTimeout(300);
  const setupText = await page.evaluate(() => document.body.innerText);
  const box = await page.$eval('[data-gcs=discounts]', e => e.innerText.replace(/\s+/g, ' '));
  ok('Discounts & commissions group holds project discount, mitigation, dealer and default source', /Project discount/i.test(box) && /mitigation/i.test(box) && /Dealer/i.test(box) && /Default cost source/i.test(box), box);
  ok('old "Default Margins & Settings" card and its per-item text are gone', !/How Discounts Work/.test(setupText) && !/Margin and Contingency are editable per item/.test(setupText));
  const disc = page.locator('[data-gcs=discounts] input').first();
  await disc.focus(); await page.waitForTimeout(120); await page.keyboard.press('Control+A'); await page.keyboard.type('5'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
  await page.click('.pcw-nav .pcw-tab >> text=Summary'); await page.waitForSelector('[data-gcs=summary]');
  const sum = () => page.$eval('[data-gcs=summary]', e => e.innerText);
  const s1 = await sum();
  // 5200/0.52 = 10000 → price 10,000, discount 500, contract 9,500
  const before = num((s1.match(/Contract value \(rounded\)\s*([\d,\.]+)/) || [])[1]), total1 = num((s1.match(/Total contract value\s*([\d,\.]+)/) || [])[1]);
  ok('Summary shows the project discount set in Setup (5% off the rounded contract value)', /Project discount/.test(s1) && before > 0 && Math.abs(total1 - before * 0.95) < 0.01, `${before} → ${total1}`);
  const sd = page.locator('[data-gcs=summary] input').first();
  await sd.focus(); await page.waitForTimeout(120); await page.keyboard.press('Control+A'); await page.keyboard.type('10'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
  const s2 = await sum();
  const total2 = num((s2.match(/Total contract value\s*([\d,\.]+)/) || [])[1]);
  ok('editing it on Summary updates the contract value (10%)', Math.abs(total2 - before * 0.9) < 0.01, `${before} → ${total2}`);
  await page.click('.pcw-nav .pcw-tab >> nth=0'); await page.waitForTimeout(300);
  ok('…and the Setup field (same value)', num(await disc.inputValue()) === 10, await disc.inputValue());
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="A-partNo"]');
  ok('per-line Discount % hidden by default', !(await page.$('th[data-col-key="discount"]')));
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
  ({ page, errors, ctx } = await openApp(b, html, mk(3)));
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="A-partNo"]'); await page.waitForTimeout(300);
  ok('project with a line discount shows the column', !!(await page.$('th[data-col-key="discount"]')));
  await ctx.close(); await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})();
