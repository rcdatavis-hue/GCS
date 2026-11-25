// v0.25 layout: header (feed pill, Save and ⋯ menus, tabs in the bar), costing views and quiet rows,
// Setup checklist and the BP "use as typed" customer, Summary (attention list, P&L collapsed, approvals).
// Usage: node test/declutter.js <built.html>
const fs = require('fs'); const { launch, openApp } = require('./harness');
const html = process.argv[2];
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });
const st = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8')); st.gcsFormat = 1;
st.costingSheets = [{ id: 'main', name: 'Plant Section 1' }];
st.proj = { ...(st.proj || {}), segment: '', bidLocation: '' };
st.items = [
  { id: 'A', type: 'item', parentId: null, sheetId: 'main', partNumber: 'PA', description: 'Costed', supplier: 'S', qty: 2, unitCost: 100, ccy: 'USD', source: 'Quotation' },
  { id: 'B', type: 'item', parentId: null, sheetId: 'main', partNumber: 'PB', description: 'No cost', supplier: 'S', qty: 1, unitCost: 0, ccy: 'USD', source: '' },
  { id: 'C', type: 'item', parentId: null, sheetId: 'main', partNumber: 'PC', description: 'Euro line', supplier: 'S', qty: 1, unitCost: 50, ccy: 'EUR', source: 'Pricelist', markupLevel: 'PASS' },
];
(async () => {
  const b = await launch();
  const { page, errors } = await openApp(b, html, JSON.stringify(st), { freshLayout: true });
  // header
  ok('tabs sit in the header bar', !!(await page.$('header.pcw-header nav.pcw-nav .pcw-tab')));
  ok('feed pill instead of the full-width banner', (await page.$eval('[data-feed-pill]', e => e.getAttribute('data-feed-pill'))) === 'off' && !(await page.$('text=Autofills, pricing history, cost lookups and supplier search are unavailable.')));
  ok('Upload / Reset / dark-mode buttons gone from the header', !(await page.$('header >> text=Upload')) && !(await page.$('header >> text=Reset')));
  await page.click('[data-hm=save]');
  const saveItems = await page.$$eval('[data-hm=save-menu] [data-hm]', x => x.map(e => e.getAttribute('data-hm')));
  ok('Save menu: .gcs, package, PDF, auto-save, open, compare', ['save-gcs', 'save-package', 'save-pdf', 'save-auto', 'save-open', 'save-compare'].every(k => saveItems.includes(k)), saveItems.join(','));
  await page.click('[data-hm=more]');
  ok('⋯ menu: preferences, dark mode, reset, version', !!(await page.$('[data-hm=pref-lang]')) && !!(await page.$('[data-hm=pref-dark]')) && !!(await page.$('[data-hm=reset]')) && /v0\.\d+/.test(await page.$eval('[data-hm=more-menu]', e => e.innerText)));
  await page.click('[data-hm=pref-dark]'); await page.waitForTimeout(200);
  ok('dark mode from the ⋯ menu', (await page.$eval('.pcw-root', e => e.getAttribute('data-theme'))) === 'dark');
  await page.click('[data-hm=pref-dark]'); await page.keyboard.press('Escape');
  // costing
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForSelector('[data-cell="A-partNo"]');
  ok('fresh layout opens in the Costing view', (await page.$eval('[data-view-switch]', e => e.getAttribute('data-view-switch'))) === 'costing');
  const vis = async () => page.$$eval('thead th', x => x.map(e => e.innerText.trim()).filter(Boolean).join('|'));
  const v1 = await vis();
  ok('Costing view: cost, cost source, cost date, inflation, markup and sell; no landed cost', /TOTAL COST/i.test(v1) && /MARKUP/i.test(v1) && /TOTAL SELL/i.test(v1) && /INFLATION/i.test(v1) && /COST DATE/i.test(v1) && (v1.match(/COST SOURCE/gi) || []).length === 2 && !/LANDED/i.test(v1), v1);
  const mig = await page.evaluate(() => { const old = { partNo: true, description: true, supplier: true, qty: true, unitCost: true, source: true, cogs: true, margins: true, sellPrice: true, actions: true, landed: false, costAdj: false, costBasis: false, costLoc: false, _gcsViewV1: true }; const n = gcsViewMigrate(old); const cust = gcsViewMigrate({ ...old, landed: true }); return [n.costLoc && n.costAdj && n.costBasis, !cust.costAdj && cust.landed]; });
  ok('a layout on the old Costing view picks up the new columns once; a custom layout is left alone', mig[0] && mig[1], JSON.stringify(mig));
  await page.click('[data-view=review]'); await page.waitForTimeout(200);
  const v2 = await vis();
  ok('Review view adds drawing and notes', /DRAWING/i.test(v2) && /NOTES/i.test(v2), v2);
  await page.click('[data-view=pricing]'); await page.waitForTimeout(200);
  ok('Pricing view shows landed cost and unit sell', /LANDED/i.test(await vis()) && /UNIT SELL/i.test(await vis()));
  await page.click('[data-view=custom]'); await page.waitForTimeout(150);
  ok('Custom opens the column list', !!(await page.$('text=Show/Hide Columns')));
  await page.click('[data-view=costing]'); await page.waitForTimeout(200);
  const st1 = await page.$$eval('tr[data-row-status]', x => Object.fromEntries(x.map(e => [e.getAttribute('data-item-id'), e.getAttribute('data-row-status')])));
  ok('row status: costed + default markup ready, no cost not', st1.A === 'ready' && st1.B !== 'ready', JSON.stringify(st1));
  const ccy = await page.$$eval('[data-ccy-cell]', x => Object.fromEntries(x.map(e => [e.getAttribute('data-ccy-cell'), e.className])));
  ok('currency picker quiet when it is the tab currency, highlighted otherwise', /pcw-hover-ctl/.test(ccy.A) && /pcw-ccy-diff/.test(ccy.C), JSON.stringify(ccy));
  const zero = await page.$eval('tr[data-item-id="B"]', e => e.innerText);
  ok('zero totals show as a dash', /–/.test(zero), zero.replace(/\s+/g, ' ').slice(0, 120));
  ok('markup on the default level is quiet, an override is not', (await page.$eval('[data-cell="A-margins"]', e => e.className)).includes('pcw-quiet') && !(await page.$eval('[data-cell="C-margins"]', e => e.className)).includes('pcw-quiet'));
  const ts = await page.$eval('[data-gcs="tab-strip"]', e => e.innerText.replace(/\s+/g, ' '));
  ok('tab strip carries readiness and confidence', /Ready \d+ \/ 3/.test(ts) && /Confidence/.test(ts), ts);
  await page.click('[data-tool=menu]');
  const tools = await page.$$eval('[data-tool-list], [data-tool]', x => x.map(e => e.getAttribute('data-tool')));
  ok('Tools menu holds sections, supplier quotes, find & replace and Excel', ['heading', 'find', 'quickest', 'lowest', 'csv', 'template', 'excel'].every(k => tools.includes(k)), tools.join(','));
  await page.keyboard.press('Escape'); await page.mouse.click(5, 300);
  // setup
  await page.click('.pcw-nav .pcw-tab >> nth=0'); await page.waitForSelector('[data-setup=checklist]');
  const miss = await page.$$eval('[data-missing-item]', x => x.map(e => e.getAttribute('data-missing-item')));
  ok('checklist lists bid location, segment and feed', ['Bid location', 'Segment', 'Feed'].every(k => miss.includes(k)), miss.join(','));
  await page.fill('[data-setup=customer-input]', 'Acme Widgets Ltd'); await page.waitForSelector('[data-setup=customer-use-typed]');
  await page.click('[data-setup=customer-use-typed]'); await page.waitForTimeout(200);
  const cs = await page.$eval('[data-cust-status]', e => e.getAttribute('data-cust-status') + ' ' + e.innerText).catch(() => '');
  ok('BP "use as typed": customer set and marked as not from the BP list', /^manual/.test(cs) && /not from the BP list/.test(cs), cs);
  ok('customer name shows in the header subtitle', /Acme Widgets Ltd/.test(await page.$eval('.pcw-logo-sub', e => e.innerText)));
  await page.click('[data-setup-more=defaults]');
  ok('CIT/standard defaults open for editing', /M&E % of sales/i.test(await page.$eval('[data-setup=method]', e => e.innerText)));
  await page.selectOption('[data-setup=segment]', { index: 1 }); await page.waitForTimeout(150);
  ok('setting the segment clears it from the checklist', !(await page.$$eval('[data-missing-item]', x => x.map(e => e.getAttribute('data-missing-item')))).includes('Segment'));
  ok('Preferences and Save & Restore cards gone from Setup', !(await page.$('text=Table Display')) && !(await page.$('text=Compare Revisions')));
  // summary
  await page.click('.pcw-nav .pcw-tab >> text=Summary'); await page.waitForSelector('[data-summary=top]');
  const att = await page.$$eval('[data-attention]', x => x.map(e => e.getAttribute('data-attention')));
  ok('needs attention: line with no cost listed', att.includes('no-cost'), att.join(','));
  ok('P&L collapsed by default with EBITDA in its summary', !(await page.$('[data-gcs=pl] table')) && /EBITDA/.test(await page.$eval('[data-gcs=pl]', e => e.innerText)));
  await page.click('[data-gcs=pl-toggle]');
  const pl = await page.$eval('[data-gcs=pl]', e => e.innerText);
  ok('P&L opens: full Excel-definition rows', ['Sales (sections + included options)', 'Contribution margin', 'Manufacturing & Engineering', 'Gross margin', 'Sales & Administration', 'EBITDA'].every(k => pl.includes(k)), pl.slice(0, 160));
  ok('project discount editable on the contract card', !!(await page.$('[data-gcs=contract] [data-gcs-field=summaryDiscount]')));
  ok('legacy confidence card and quote-quality stars gone', !(await page.$('text=Quote Quality')) && !(await page.$('text=Actuals=5')));
  ok('approval log lives on Summary, approve button in the actions', !!(await page.$('[data-collapsible=approvals]')) && !!(await page.$('[data-summary=approve]')));
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
  await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
