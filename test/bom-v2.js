// V2 SCM BOM levels: engine build from the real V2 model file, then the costing table (assembly header rows,
// level badges, collapse, roll-up totals, quantity rescale, header removal).
// Usage: node test/bom-v2.js <built.html> <v2-model.xlsx>
const fs = require('fs'), vm = require('vm'), path = require('path');
const { launch, openApp } = require('./harness');
const [, , html, modelFile] = process.argv;
const XLSX = require(path.join(process.env.NM || path.join(process.env.HOME, 'tools/node_modules'), 'xlsx'));
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });

// ── Engine ──
const code = [...fs.readFileSync(html, 'utf8').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(m => m[2]).filter(c => c.trim())[0];
const ctx = { console, Math, JSON, Map, Set, WeakMap, Object, Array, Number, String, Date, parseFloat, isFinite, isNaN, XLSX, performance,
  React: { createContext: () => ({}), useMemo: f => f(), useCallback: f => f, useRef: v => ({ current: v }), useState: v => [v, () => {}], useEffect() {}, useContext() {}, memo: f => f },
  crypto: {}, window: {}, document: {}, localStorage: { getItem() { return null; }, setItem() {} }, navigator: {}, TextEncoder };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(code + ';this.__s={scmParseModelFile,scmBuildItems,bomHiddenIds,bomRollup,bomSetQty,bomIsAssembly,buildTree};', ctx);
const S = ctx.__s;
const p = S.scmParseModelFile(XLSX.read(fs.readFileSync(modelFile), { dense: true }), path.basename(modelFile));
ok('V2 detected from the file', p.version === 2 && p.lines.length === 109, `v${p.version} ${p.lines.length} lines`);
let n = 0; const items = S.scmBuildItems({ model: { 'Model ID': p.info['Model ID'], 'Model Description': p.info['Model Description'], Rate: p.info.Rate, Status: p.info.Status },
  lines: p.lines, version: 2, sheetId: 'main', newId: () => 'n' + (++n) });
const asm = items.filter(S.bomIsAssembly), lines = items.filter(i => i.type === 'item');
ok('7 assemblies become header rows, 102 priced lines', asm.length === 7 && lines.length === 102, `${asm.length} / ${lines.length}`);
ok('every priced line is a top-level line (own markup)', lines.every(i => !i.parentId));
const bySap = s => items.find(i => (i.partNumber || (i.bom && i.bom.sap)) === s);
const link = bySap('10279028'), bush = bySap('10278731'), root = bySap('10624986');
ok('quantities stay as the SAP totals (bushing 848 under the 424 chain link)', bush.qty === 848 && link.bom.qty === 424 && bush.bom.asm === link.id && link.bom.asm === root.id, `${bush.qty} under ${link.bom.qty}`);
ok('levels and depth: root L2 depth 0, chain link L3 depth 1, bushing L4 depth 2', root.bom.level === 2 && root.bom.depth === 0 && link.bom.depth === 1 && bush.bom.level === 4 && bush.bom.depth === 2);
ok('root open, sub-assemblies collapsed', !root.bom.collapsed && asm.filter(a => a !== root).every(a => a.bom.collapsed));
const radar = bySap('10421962');
ok('bad paste row: qty moved from the drawing column, merged cell flagged with the missing item',
  radar.qty === 2 && radar.drawingNumber === '' && radar.scm.issues.includes('merged') && radar.scm.mergedItems.some(m => m.sap === '10281456') && radar.tag === 'EX-203',
  JSON.stringify({ qty: radar.qty, tag: radar.tag, issues: radar.scm.issues, m: radar.scm.mergedItems }));
const hidden = S.bomHiddenIds(items);
ok('collapsed assemblies hide their 16 lines', hidden.size === 16, hidden.size);
const scaled = S.bomSetQty(items, link.id, 848);
ok('assembly qty 424 → 848 doubles its lines only', scaled.find(i => i.id === bush.id).qty === 1696 && scaled.find(i => i.partNumber === '10281513').qty === 424);
const scaledRoot = S.bomSetQty(items, root.id, 2);
ok('root qty 1 → 2 doubles everything, sub-assembly headers included', scaledRoot.find(i => i.id === bush.id).qty === 1696 && scaledRoot.find(i => i.id === link.id).bom.qty === 848);

// ── UI ──
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
const st = JSON.parse(JSON.stringify(base)); st.gcsFormat = 1;
st.costingSheets = [{ id: 'main', name: 'Plant Section 1' }];
// costs on the chain-link lines and a markup on each
st.items = items.map(i => {
  if (i.type !== 'item') return i;
  const c = { '10278731': 5, '10278730': 4, '10279029': 100 }[i.partNumber];
  return c ? { ...i, unitCost: c, source: 'Quotation', supplier: 'Acme', margin: 20 } : i;
});
(async () => {
  const b = await launch();
  fs.writeFileSync('/tmp/bomstate.json', JSON.stringify(st)); const { page, errors } = await openApp(b, html, JSON.stringify(st), { height: 6000 });
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForTimeout(500);
  const asmRows = await page.$$eval('tr[data-bom-asm]', r => r.length);
  ok('header rows rendered (root + 6 collapsed)', asmRows === 7, asmRows);
  const lineRows = await page.$$eval('[data-bom-line]', r => r.length);
  ok('lines under collapsed assemblies are hidden', lineRows === 86, lineRows);
  const badge = await page.$eval(`tr[data-bom-asm="${link.id}"]`, e => e.innerText);
  ok('header shows level, SAP item and line count', /L3/.test(badge) && /10279028/.test(badge) && /3 lines/.test(badge), badge.replace(/\s+/g, ' '));
  await page.click(`[data-bom-toggle="${link.id}"]`); await page.waitForTimeout(300);
  ok('expanding shows the 3 lines', (await page.$$eval('[data-bom-line]', r => r.length)) === 89);
  const lv = await page.$eval(`[data-cell="${bush.id}-description"]`, e => e.closest("td").innerText).catch(() => '');
  ok('child line carries an L4 badge', /L4/.test(lv), lv);
  // expected roll-up: 848×5 + 424×4 + 424×100 = 48,336
  const cost = await page.$eval(`[data-bom-cost="${link.id}"]`, e => e.innerText).catch(() => '');
  ok('header rolls up the cost of its lines', cost.replace(/[^\d.]/g, '').startsWith('48336'), cost);
  const rootCost = await page.$eval(`[data-bom-cost="${root.id}"]`, e => e.innerText).catch(() => '');
  ok('root rolls up the whole model', rootCost === cost, rootCost);
  await page.fill(`[data-bom-qty="${link.id}"]`, '848'); await page.press(`[data-bom-qty="${link.id}"]`, 'Enter'); await page.waitForTimeout(400);
  const q = await page.$eval(`[data-cell="${bush.id}-qty"]`, e => e.value).catch(() => null);
  const cost2 = await page.$eval(`[data-bom-cost="${link.id}"]`, e => e.innerText);
  ok('changing the header qty rescales its lines and the roll-up', parseFloat(String(q).replace(/,/g, '')) === 1696 && cost2.replace(/[^\d.]/g, '').startsWith('96672'), `${q} ${cost2}`);
  const totals = await page.$eval('tfoot', e => e.innerText);
  ok('tab total matches (headers carry no cost)', /96,?672/.test(totals), totals.slice(0, 200).replace(/\s+/g, ' '));
  const warn = await page.$(`[data-scm-issue="${radar.id}"]`);
  ok('SCM issue marker on the bad row', !!warn);
  await page.click(`tr[data-bom-asm="${root.id}"]`, { button: 'right' }); await page.click('text=Expand all assemblies'); await page.waitForTimeout(300);
  ok('expand all shows all 102 lines', (await page.$$eval('[data-bom-line]', r => r.length)) === 102);
  await page.click(`tr[data-bom-asm="${link.id}"]`, { button: 'right' }); await page.click('text=Remove header (keep its lines)'); await page.waitForTimeout(300);
  const d = await page.$eval(`[data-cell="${bush.id}-description"]`, e => e.closest("td").querySelector('[data-bom-line]').getAttribute('data-bom-line'));
  ok('removing a header keeps its lines one level up', (await page.$$eval('tr[data-bom-asm]', r => r.length)) === 6 && d === '1', d);
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: '/tmp/bom-v2.png', fullPage: false });
  await b.close();
  const fail = results.filter(r => !r.pass);
  results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail !== undefined ? '  — ' + r.detail : ''}`));
  console.log(`\n${results.length - fail.length}/${results.length} passed`); process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
