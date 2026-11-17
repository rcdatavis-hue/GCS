// GCS engine vs an independent model of the Excel GCS V3.8 formulas.
// The model below is written from the workbook's cell formulas (Plant Section rows 17-45, Summary 14-47,
// Engine), NOT from the app's code, so it checks the app against Excel rather than against itself.
// Usage: node test/excel-parity.js <built.html> [runs]
const fs = require('fs'), vm = require('vm');
const [, , html, runsArg] = process.argv; const RUNS = +runsArg || 400;
const code = [...fs.readFileSync(html, 'utf8').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(m => m[2]).filter(c => c.trim())[0];
const ctx = { console, Math, JSON, Map, Set, WeakMap, Object, Array, Number, String, Date, parseFloat, isFinite, isNaN,
  React: { createContext: () => ({}), useMemo: f => f(), useCallback: f => f, useRef: v => ({ current: v }), useState: v => [v, () => {}], useEffect() {}, useContext() {}, memo: f => f },
  crypto: {}, window: {}, document: {}, localStorage: { getItem() { return null; }, setItem() {} }, navigator: {}, TextEncoder };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(code + '\n;this.__api={buildTree,calcNode,computePricing,computeGcsSummary,gcsMigrateData};', ctx);
const A = ctx.__api;

// ── Excel model ────────────────────────────────────────────────────────────
const RATES = { USD: 1, EUR: 0.882768, GBP: 0.753864, BRL: 5.174 };          // Fx Base: units per USD
const DEF_MARKUP = { 'PASS': 0, 'CPM (A)': 0.1, 'CPM (B)': 0.465, 'CROWN (A)': 0.48, 'CROWN (B)': 0.6, 'CROWN (C)': 0.6 };
const SEG = { 'Crush (Preparation & Pressing)': [0.21, 0.30], 'Liquids (Refining, Biodiesel, Oleochemicals)': [0.20, 0.30], 'Specialty (Protein Concentrate)': [0.36, 0.45] };
const DATEDIF_M = (a, b) => { // Excel DATEDIF(a,b,"m")
  const x = new Date(a), y = new Date(b); let m = (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth();
  if (y.getDate() < x.getDate()) m--; return m; };
const CEILING = (v, s) => Math.ceil(v / s - 1e-9) * s;
function excel(P) {
  const B1 = P.costingDate, B5 = P.plantFeed;
  const sections = P.tabs.map(tab => {
    const Z = tab.markup;                              // column Z "User Set %" (fractions)
    const AK = l => 1 - Z[l];                          // AK = 1 − Z
    const rows = P.lines.filter(l => l.tab === tab.id).map(l => {
      const Q = (B5 > 0 && l.size > 0) ? Math.pow(B5 / l.size, 0.6) : 1;                     // Q17 (size given = EQD line)
      const R = (!l.date || new Date(l.date) > new Date(B1)) ? 0 : DATEDIF_M(l.date, B1) * 0.005; // R17
      const S = (l.cost / RATES[l.ccy]) * Q * (1 + R);                                         // S17
      const T = S * l.qty;                                                                     // T17
      const V = T / AK(l.level);                                                               // V17
      return { T, V, sub: l.sub };
    });
    const T38 = rows.reduce((s, r) => s + r.T, 0), V38 = rows.reduce((s, r) => s + r.V, 0);
    const on = T38 > 0;
    const T41 = on ? T38 * tab.prov.fca : 0;                                                    // FCA/Packing
    const T42 = on ? rows.filter(r => r.sub === 'C5').reduce((s, r) => s + r.T, 0) * tab.prov.c5 : 0;
    const T43 = on ? rows.filter(r => r.sub === 'H1').reduce((s, r) => s + r.T, 0) * tab.prov.h1 : 0;
    const T40 = on ? (V38 + T41 + T42 + T43) * tab.prov.su : 0;                                // Start-up risk (PASS: V = T)
    const T45 = T38 + T40 + T41 + T42 + T43, V45 = V38 + T40 + T41 + T42 + T43;                 // grand totals
    const Z9 = V45 * P.mE, Z10 = V45 * P.sA, Z11 = V45 - (T45 + Z9 + Z10);                       // M&E, S&A, EBITDA
    return { id: tab.id, include: tab.type !== 'option' || tab.include, n: rows.length, T45, V45, Z9, Z10, Z11,
      ebitdaPct: V45 > 0 ? Z11 / V45 : 0, L: CEILING(V45, 1000), seg: tab.segment, disc: tab.discount ?? P.discount };
  });
  const inc = sections.filter(s => s.include && s.n > 0);
  const J35 = inc.reduce((s, x) => s + x.V45, 0), L2 = inc.reduce((s, x) => s + x.T45, 0);
  const L37 = inc.reduce((s, x) => s + x.L, 0);
  const disc = inc.reduce((s, x) => s + x.L * x.disc, 0);                                     // per-tab K39 (project % when no override)
  const L5 = (J35 - L2) - (J35 * P.mE + J35 * P.sA) - disc;                                    // Summary L5 incl. Engine K2
  const over = L37 > 1000000;                                                                  // Summary L35 > 1,000,000
  sections.forEach(s => { s.target = SEG[s.seg] ? SEG[s.seg][over ? 0 : 1] : null; });
  return { sections, J35, L2, L37, disc, L5, K5: J35 > 0 ? L5 / J35 : 0, L47: L37 - disc };
}

// ── random projects, expressed both ways ──
let seed = 2026; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)); const ch = a => a[ri(0, a.length - 1)];
const LEVELS = Object.keys(DEF_MARKUP);
function project() {
  const nTabs = ri(1, 5); const tabs = [];
  for (let t = 0; t < nTabs; t++) {
    const markup = {}; LEVELS.forEach(l => { markup[l] = rnd() < 0.3 && l !== 'PASS' ? +(rnd() * 0.7).toFixed(3) : DEF_MARKUP[l]; });
    tabs.push({ id: 't' + t, type: t > 0 && rnd() < 0.3 ? 'option' : 'section', include: rnd() < 0.5, markup,
      prov: { su: ch([0.01, 0.01, 0.02, 0]), fca: ch([0.02, 0.02, 0.03, 0]), c5: ch([0.051, 0.051, 0]), h1: ch([0, 0, 0.04]) },
      segment: ch(Object.keys(SEG)), discount: rnd() < 0.25 ? ch([0, 0.03, 0.05]) : undefined, defaultLevel: ch(LEVELS) });
  }
  const lines = []; const n = ri(0, 30);
  for (let i = 0; i < n; i++) lines.push({ tab: ch(tabs).id, cost: rnd() < 0.1 ? 0 : +(rnd() * ch([500, 5000, 80000])).toFixed(2),
    ccy: ch(Object.keys(RATES)), qty: ch([1, 1, 2, 3, 10]), level: ch(LEVELS),
    size: rnd() < 0.3 ? ch([5, 50, 120, 400]) : 0, date: rnd() < 0.5 ? ch(['2023-01-15', '2024-06-30', '2025-11-17', '2026-10-31', '2027-02-01']) : '',
    sub: ch(['', '', 'A1', 'C3', 'C5', 'H1']), useDefault: rnd() < 0.3 });
  return { tabs, lines, plantFeed: ch([0, 200, 600]), costingDate: '2026-11-17', mE: 0.1, sA: ch([0.1, 0.08]), discount: ch([0, 0, 0.02, 0.05]) };
}
function app(P) {
  const sheets = P.tabs.map(t => {
    const mk = {}; LEVELS.forEach(l => { mk[l] = t.markup[l] * 100; });
    return { id: t.id, name: t.id, type: t.type, include: t.include, markup: mk, defaultLevel: t.defaultLevel,
      discount: t.discount === undefined ? null : t.discount * 100, segment: t.segment,
      provisions: { startupRisk: t.prov.su * 100, fcaPacking: t.prov.fca * 100, c5Duty: t.prov.c5 * 100, h1Duty: t.prov.h1 * 100 } };
  });
  const items = P.lines.map((l, i) => ({ id: 'x' + i, type: 'item', parentId: null, sheetId: l.tab, unitCost: l.cost, ccy: l.ccy, qty: l.qty,
    markupLevel: l.useDefault ? undefined : l.level, margin: 0, costDate: l.date, sizeCapacity: l.size, subCat: l.sub,
    category: l.sub ? l.sub[0] : '', source: 'Quotation', discount: 0 }));
  const proj = { sellCcy: 'USD', rates: { ...RATES }, plantFeed: P.plantFeed, costingDate: P.costingDate, inflationPerMonth: 0.5,
    scalingExponent: 0.6, mAndE: P.mE * 100, sAndAExpense: P.sA * 100, gcsDiscount: P.discount * 100, roundTo: 1000, bu: 'CIW', defaultDealer: 0, discountMitigation: 0 };
  const tree = A.buildTree(items).map(n => A.calcNode(n, proj.rates, proj.sellCcy, { isCIT: false, brazilTaxes: {}, proj }));
  const pricing = A.computePricing({ tree, items, frt: { inbound: [], outbound: [], packingCrating: {} }, proj, brazilTaxes: {}, brazilStates: {},
    isCIT: false, forceAllocToPricelist: false, forceAllocToZeroCost: { freight: false, siscomex: false, afrmm: false },
    distributeOutboundFreight: false, distributePackingCrating: false, sheets });
  return A.computeGcsSummary({ tree, sheets, proj, pricing });
}
const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
let fails = 0, checks = 0;
for (let r = 0; r < RUNS; r++) {
  const P = project();
  P.lines.forEach(l => { if (l.useDefault) l.level = P.tabs.find(t => t.id === l.tab).defaultLevel; });
  const X = excel(P), G = app(P);
  const cmp = (what, a, b) => { checks++; if (!close(a, b)) { fails++; if (fails <= 8) console.log(`run ${r} ${what}: excel ${a} app ${b}`); } };
  X.sections.forEach(xs => {
    const gs = G.tabs.find(t => t.id === xs.id);
    cmp(`${xs.id} COGS`, xs.T45, gs.cogs); cmp(`${xs.id} sales`, xs.V45, gs.sales); cmp(`${xs.id} M&E`, xs.Z9, gs.mAndE);
    cmp(`${xs.id} S&A`, xs.Z10, gs.sAndA); cmp(`${xs.id} EBITDA`, xs.Z11, gs.ebitda); cmp(`${xs.id} EBITDA%`, xs.ebitdaPct * 100, gs.ebitdaPct);
    cmp(`${xs.id} rounded`, xs.L, gs.price);
    checks++; if ((xs.target === null ? null : xs.target * 100) !== gs.target) { fails++; if (fails <= 8) console.log(`run ${r} ${xs.id} target ${xs.target} vs ${gs.target}`); }
  });
  cmp('project sales', X.J35, G.project.sales); cmp('project COGS', X.L2, G.project.cogs); cmp('discount', X.disc, G.project.discount);
  cmp('project EBITDA', X.L5, G.project.ebitda); cmp('project EBITDA%', X.K5 * 100, G.project.ebitdaPct);
  cmp('contract value', X.L47, G.project.contractValue);
}
console.log(`${RUNS} random projects, ${checks} checks: ${fails ? fails + ' MISMATCHED' : 'all match the Excel formulas'}`);
process.exit(fails ? 1 : 0);
