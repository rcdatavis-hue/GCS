// Exchange rates refresh automatically when the feed file is connected (unlocked projects only), and the
// Summary tab's Selected Suppliers card starts collapsed.
// Usage: node test/feed-rates.js <built.html>
const fs = require('fs'); const { launch, openApp } = require('./harness');
const html = process.argv[2];
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
const feed = fs.readFileSync(__dirname + '/fixtures/feed-rates.xlsx').toString('base64');
const feed2 = fs.readFileSync(__dirname + '/fixtures/feed-rates-2.xlsx').toString('base64');
const stateWith = locked => { const st = JSON.parse(JSON.stringify(base)); st.gcsFormat = 1; st.project = { ...st.project, locked, ratesRefreshedAt: null }; return JSON.stringify(st); };

async function connect(page, data = feed) {
  await page.evaluate(b64 => {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const handle = { kind: 'file', name: 'PCW_Feed.xlsx', getFile: async () => new File([bin], 'PCW_Feed.xlsx', { lastModified: Date.now() }), queryPermission: async () => 'granted', requestPermission: async () => 'granted' };
    window.showOpenFilePicker = async () => [handle];
  }, data);
  await page.$eval('[data-feed-pill]', e => e.click());
  const loaded = await page.waitForSelector('[data-feed-pill=on]', { timeout: 15000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(800);
  return loaded;
}
const ratesShown = async page => { if (!(await page.$('text=EUR per USD'))) await page.click('[data-setup=rates-edit]').catch(() => {}); await page.waitForTimeout(100); return ratesEval(page); };
const ratesEval = page => page.evaluate(() => {
  const out = {}; document.querySelectorAll('input').forEach(i => { const lab = (i.closest('div') || {}).innerText || ''; const m = lab.trim().match(/^(EUR|GBP|BRL)\b/); if (m && i.value) out[m[1]] = i.value; });
  return { out, refreshed: /Rates from the feed[^\n]*today/i.test(document.body.innerText), never: /Rates not refreshed/.test(document.body.innerText) };
});

(async () => {
  const b = await launch();
  // unlocked: rates follow the feed
  let { page, errors, ctx } = await openApp(b, html, stateWith(false));
  await page.click('.pcw-nav .pcw-tab >> nth=0'); await page.waitForTimeout(300);
  const before = await ratesShown(page);
  await connect(page);
  await page.click('.pcw-nav .pcw-tab >> nth=0'); await page.waitForTimeout(300);
  const after = await ratesShown(page);
  if (process.env.DBG) console.log(JSON.stringify({ before, after }));
  ok('rates refresh on connecting the feed (EUR 0.92 → 0.8765, GBP 0.79 → 0.7654, BRL 5.8 → 5.4321)', /0\.8765/.test(after.out.EUR) && /0\.7654/.test(after.out.GBP) && /5\.4321/.test(after.out.BRL) && after.refreshed, JSON.stringify({ before: before.out, after: after.out, refreshed: after.refreshed }));
  // reconnecting (a feed with different rates) does not change them; the manual refresh does
  await page.click('button:has-text("Disconnect")'); await page.waitForTimeout(300);
  await connect(page, feed2);
  await page.click('.pcw-nav .pcw-tab >> nth=0'); await page.waitForTimeout(300);
  const again = await ratesShown(page);
  ok('reconnecting the feed later does not change the rates', /0\.8765/.test(again.out.EUR) && /0\.7654/.test(again.out.GBP), JSON.stringify(again.out));
  await page.click('[data-setup=rates-refresh]'); await page.waitForTimeout(600);
  const manual = await ratesShown(page);
  ok('"Refresh from Feed" still updates them', /^0\.5/.test(manual.out.EUR) && /^0\.4/.test(manual.out.GBP) && /^3\.3/.test(manual.out.BRL), JSON.stringify(manual.out));
  // Summary: Selected Suppliers collapsed by default, expands on click
  await page.click('.pcw-nav .pcw-tab >> text=Summary'); await page.waitForSelector('[data-collapsible="suppliers"]');
  const collapsed = await page.$eval('[data-collapsible="suppliers"]', e => ({ table: !!e.querySelector('table'), text: e.innerText }));
  ok('Selected Suppliers collapsed by default, with a one-line summary', !collapsed.table && /supplier/.test(collapsed.text) && /top:/.test(collapsed.text), collapsed.text.replace(/\s+/g, ' '));
  await page.click('[data-collapsible-toggle="suppliers"]'); await page.waitForTimeout(200);
  ok('click expands it', await page.$eval('[data-collapsible="suppliers"]', e => !!e.querySelector('table')));
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
  // locked: rates unchanged
  ({ page, errors, ctx } = await openApp(b, html, stateWith(true)));
  const lockedLoaded = await connect(page);
  await page.click('.pcw-nav .pcw-tab >> nth=0', { force: true }); await page.waitForTimeout(300);
  const locked = await ratesShown(page);
  ok('locked project keeps its rates (feed did load)', lockedLoaded && /0\.92/.test(locked.out.EUR) && !locked.refreshed, JSON.stringify(locked));
  await ctx.close(); await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})();
