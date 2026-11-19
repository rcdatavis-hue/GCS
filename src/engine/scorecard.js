
// ═══ SCORECARD EXPORT ═════════════════════════════════════════════════════════════════════════════════════
// Fills the Engineered Solutions scorecard workbook (embedded blank template, GCS_SCORECARD_TEMPLATE_B64) from the
// GCS: header, suggested customer tier / costing confidence, supplier currencies, P&L inputs, the Costing
// Confidence line list and the CashFlow section table. Judgement fields (region / sanctions, relationship,
// contract terms, sign-offs …) are left for the review team. Cells are written straight into the sheet XML with
// JSZip so the template's formatting, dropdowns, formulas and charts are kept; Excel recalculates on open.
// Amounts in the scorecard are USD (Dashboard P&L in $k, as the template).

const GCS_SC_SHEETS = { dashboard: 'xl/worksheets/sheet1.xml', cashflow: 'xl/worksheets/sheet2.xml', confidence: 'xl/worksheets/sheet5.xml' };
const GCS_SC_MENU = {
  office: { CIW: 'CIW: Blaine, USA', CIT: 'CIT: Sao Paulo, Brazil', CIA: 'CIA: Rosario, Argentina', ECL: 'ECL: Hull, UK', CAE: 'CAE: Wuhan, China' },
  tier: ['Tier 1 - ADM, Bunge, Cargill, COFCO, LDC, Wilmar', 'Tier 2 - Strong Regional Players, +2 plants, Existing Engineered Solutions Customer', 'Tier 3 - New Customers or Single Site Plants'],
  existing: 'Existing Customer',
  confidence: {
    High: 'High: Supply Chain is engaged in the process and we have>80% costs recently quoted (Fabrication + 3rd Party Purchased items)',
    Medium: 'Medium: Supply Chain is engaged & significant Fabricated items have been quoted & we are utilizing the balance of cost estimates from previous projects actuals over the past 0-4 years',
    Low: 'Low: Supply Chain has not been engaged, and/or these are engineering estimates, and/or costs pullled from previous projects > 5 years',
  },
  payCcy: ['Payment Receipt in USD', 'Payment Receipt in GBP, Reals, Euros, RMB', 'Payment Receipt in Other Currency'],
  incoterm: { DDP: 'DDP', DAP: 'DAP', FCA: 'FCA, ExWorks', EXW: 'FCA, ExWorks' },
};
const GCS_SC_TIER1 = /\b(ADM|Archer[- ]Daniels|Bunge|Cargill|COFCO|LDC|Louis[- ]Dreyfus|Wilmar)\b/i;
// Row 15 of the Fabricated block is outside the template's subtotal (F16 = SUM(F7:F14)), so it is not used.
const GCS_SC_SLOTS = { fab: [7, 14], cpm: [19, 20], third: [24, 38] };

// ── Rigor and per-line confidence (scorecard Costing Confidence sheet) ──
const gcsRigorOf = (source, n) => {
  if (n && n.scm && n.scm.modelId) return 'COST MODEL';
  if (source === 'Quotation' || source === 'EQD') return 'QUOTE';
  if (source === 'Pricelist') return 'SUPPLY CHAIN';
  if (source === 'Project Cost') return 'PROJECT COST';
  if (source === 'Item Cost Use Guidance') return 'FACTOR';
  return 'ESTIMATE';
};
const gcsLineConfidence = (rigor, ageMonths) => {
  if (rigor === 'ESTIMATE' || rigor === 'FACTOR') return 'Low';
  if (ageMonths !== null && ageMonths > 60) return 'Low';
  if (rigor === 'QUOTE' && ageMonths !== null && ageMonths <= 12) return 'High';
  return 'Medium';
};

// ── Data from the GCS ──
// ctx: { proj, sched, tree, sheets, summary (computeGcsSummary), pricing, customerExisting (true/false/null) }
const gcsScorecardData = ctx => {
  const { proj, sched, tree, sheets, summary, pricing } = ctx;
  const P = summary.project;
  const usd = v => conv(Number(v) || 0, proj.sellCcy, 'USD', proj.rates);
  const usdFrom = (v, ccy) => conv(Number(v) || 0, ccy || 'USD', 'USD', proj.rates);
  const idx = gcsSheetIndex(sheets);
  const included = new Set(summary.tabs.filter(t => t.include).map(t => t.id));
  const tabName = id => (summary.tabs.find(t => t.id === id) || {}).name || '';
  const asOf = gcsCostingDate(proj);
  const lines = [];
  tree.filter(n => included.has(idx.idOf(n))).forEach(n => {
    // Landed cost (incl. inbound freight and tariffs allocated to the line), so the scorecard's COGS matches the GCS P&L
    const cost = usd(pricing.getAlloc(n).landed);
    if (!(cost > 0)) return;
    const mix = gcsConfidenceMix([n]);
    const top = mix.parts.slice().sort((a, b) => b.cost - a.cost)[0];
    const source = n._ch && n._ch.length ? (top ? top.source : n.source || '') : (n.source || '');
    const cat = n.subCat || n.category || '';
    const block = cat[0] === 'A' ? 'fab' : cat[0] === 'B' ? 'cpm' : 'third';
    const catName = gcsCategoryName(cat) || (block === 'third' ? 'Uncategorised' : '');
    const age = n.costDate ? gcsMonthsBetween(n.costDate, asOf) : null;
    const rigor = gcsRigorOf(source, n);
    const supplier = n.supplier || (n._ch || []).map(c => c.supplier).find(Boolean) || '';
    const pv = gcsCostProvenance(n);
    lines.push({ id: n.id, tab: tabName(idx.idOf(n)), block, cat, catName, partNumber: n.partNumber || '', description: n.description || '', qty: n.qty || 1,
      cost, sell: usd(pricing.getItemNetPrice(n)), source, rigor, supplier, costDate: n.costDate || '', ageMonths: age, confidence: gcsLineConfidence(rigor, age),
      inflationPct: gcsInflationPct(n, proj), scaling: gcsScaling(n, proj), ccy: n.ccy || 'USD', unitCostNative: Number(n.unitCost) || 0,
      ref: pv ? [pv.short, pv.doc, pv.location].filter(Boolean).join(' ') : '', eqd: !!(n.eqd && n.eqd.equipment) });
  });
  // provisions by kind (included tabs)
  const prov = { startupRisk: 0, fcaPacking: 0, duties: 0 };
  summary.tabs.filter(t => t.include).forEach(t => { const p = t.provisions || {}; prov.startupRisk += usd(p.startupRisk); prov.fcaPacking += usd(p.fcaPacking); prov.duties += usd((p.c5Duty || 0) + (p.h1Duty || 0)); });
  // costing confidence suggestion (Menus: High >80% recently quoted; Low = estimates / costs > 5 years)
  const base = lines.reduce((s, l) => s + l.cost, 0);
  const share = f => (base > 0 ? lines.filter(f).reduce((s, l) => s + l.cost, 0) / base : 0);
  const recentQuoted = share(l => l.rigor === 'QUOTE' && (l.ageMonths === null || l.ageMonths <= 12));
  const weak = share(l => l.rigor === 'ESTIMATE' || l.rigor === 'FACTOR' || (l.ageMonths !== null && l.ageMonths > 60));
  const costingConfidence = base <= 0 ? '' : recentQuoted >= 0.8 ? 'High' : weak > 0.2 ? 'Low' : 'Medium';
  // supplier currencies by block (share of native cost)
  const ccyMix = f => {
    const m = new Map(); lines.filter(f).forEach(l => m.set(l.ccy, (m.get(l.ccy) || 0) + l.cost));
    const tot = [...m.values()].reduce((s, v) => s + v, 0); if (!tot) return '';
    const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
    return arr.length === 1 ? arr[0][0] : arr.map(([c, v]) => `${c} ${Math.round(v / tot * 100)}%`).join(' | ');
  };
  const name = (proj.customer && proj.customer.name) || '';
  const existing = ctx.customerExisting;
  const tier = !name ? '' : GCS_SC_TIER1.test(name) ? GCS_SC_MENU.tier[0] : existing === true ? GCS_SC_MENU.tier[1] : existing === false ? GCS_SC_MENU.tier[2] : '';
  const sellCcy = proj.sellCcy || 'USD';
  const cpm = lines.filter(l => l.block === 'cpm');
  const dealer = Number(proj.defaultDealer) || 0;
  return {
    header: { customer: name, ref: proj.ref || '', description: proj.name || '', office: GCS_SC_MENU.office[String(proj.bu || '').toUpperCase()] || '',
      location: [proj.customer && proj.customer.city, proj.customer && proj.customer.country].filter(Boolean).join(', '), agent: dealer > 0 ? 'Yes' : 'No' },
    suggest: { tier, existing: existing === true ? GCS_SC_MENU.existing : '', costingConfidence, costingConfidenceText: costingConfidence ? GCS_SC_MENU.confidence[costingConfidence] : '',
      recentQuotedPct: recentQuoted * 100, weakPct: weak * 100 },
    currency: { all: ccyMix(() => true), fab: ccyMix(l => l.block === 'fab'), third: ccyMix(l => l.block !== 'fab') },
    payCcy: sellCcy === 'USD' ? GCS_SC_MENU.payCcy[0] : ['GBP', 'BRL', 'EUR', 'CNY'].includes(sellCcy) ? GCS_SC_MENU.payCcy[1] : GCS_SC_MENU.payCcy[2],
    incoterm: GCS_SC_MENU.incoterm[String(proj.incoterm || '').toUpperCase()] || '', incotermRaw: proj.incoterm || '',
    discountPct: Number(proj.gcsDiscount) || 0, mE: (Number(proj.mAndE ?? 10) || 0) / 100, sA: (Number(proj.sAndAExpense ?? 10) || 0) / 100,
    links: { salesforce: (sched && sched.salesforceLink) || '', sharepoint: (sched && sched.sharepointLink) || '' },
    money: { equipment: usd(P.contractBeforeDiscount), discount: usd(P.discount), freightSell: usd(P.shippingPrice), freightCost: usd(P.shippingCost),
      cpmSell: cpm.reduce((s, l) => s + l.sell, 0), cpmCost: cpm.reduce((s, l) => s + l.cost, 0), agentCommission: usd(P.contractValue) * dealer / 100 },
    prov, lines, asOf, projectName: proj.name || proj.ref || 'Project', sellCcy,
  };
};

// ── Sheet XML cell writer ──
const gcsScEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const gcsScColNum = c => c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const gcsScDateSerial = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 : null; };
const gcsScSetCell = (xml, ref, value, opts = {}) => {
  const [, col, rowS] = /^([A-Z]+)(\d+)$/.exec(ref); const row = +rowS;
  const re = new RegExp(`<c r="${ref}"((?: [^>]*?)?)(?:/>|>([\\s\\S]*?)</c>)`);
  const m = re.exec(xml);
  let style = '';
  if (m) { const s = /\ss="(\d+)"/.exec(m[1] || ''); style = s ? ` s="${s[1]}"` : ''; }
  let cell;
  if (opts.formula) cell = `<c r="${ref}"${style}><f>${gcsScEsc(opts.formula)}</f></c>`;
  else if (value === null || value === undefined || value === '') cell = `<c r="${ref}"${style}/>`;
  else if (typeof value === 'number' && isFinite(value)) cell = `<c r="${ref}"${style}><v>${value}</v></c>`;
  else cell = `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${gcsScEsc(value)}</t></is></c>`;
  if (m) return xml.slice(0, m.index) + cell + xml.slice(m.index + m[0].length);
  const rm = new RegExp(`<row r="${row}"[^>]*?(?:/>|>([\\s\\S]*?)</row>)`).exec(xml);
  if (rm) {
    if (rm[0].endsWith('/>')) return xml.slice(0, rm.index) + rm[0].slice(0, -2) + '>' + cell + '</row>' + xml.slice(rm.index + rm[0].length);
    const open = rm[0].slice(0, rm[0].indexOf('>') + 1), inner = rm[1] || '';
    let pos = inner.length;
    for (const c of inner.matchAll(/<c r="([A-Z]+)\d+"/g)) if (gcsScColNum(c[1]) > gcsScColNum(col)) { pos = c.index; break; }
    return xml.slice(0, rm.index) + open + inner.slice(0, pos) + cell + inner.slice(pos) + '</row>' + xml.slice(rm.index + rm[0].length);
  }
  let at = xml.indexOf('</sheetData>');
  for (const r of xml.matchAll(/<row r="(\d+)"/g)) if (+r[1] > row) { at = r.index; break; }
  return xml.slice(0, at) + `<row r="${row}">${cell}</row>` + xml.slice(at);
};

// Fit lines into a block's fixed rows: biggest first; if there are more lines than rows, the last row sums the rest
const gcsScFit = (lines, slots) => {
  const sorted = lines.slice().sort((a, b) => b.cost - a.cost);
  if (sorted.length <= slots) return sorted;
  const keep = sorted.slice(0, slots - 1), rest = sorted.slice(slots - 1);
  const cost = rest.reduce((s, l) => s + l.cost, 0);
  const byRigor = new Map(); rest.forEach(l => byRigor.set(l.rigor, (byRigor.get(l.rigor) || 0) + l.cost));
  const rigor = [...byRigor.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const confRank = { Low: 0, Medium: 1, High: 2 };
  const confidence = rest.reduce((w, l) => (confRank[l.confidence] < confRank[w] ? l.confidence : w), 'High');
  return [...keep, { catName: 'Other', description: `${rest.length} further lines (see GCS Lines sheet)`, cost, rigor, confidence, supplier: 'Various', costDate: '', inflationPct: null, scaling: 1, tab: '', source: '', ref: '', partNumber: '', grouped: rest.length }];
};

const gcsBuildScorecard = async data => {
  if (typeof JSZip === 'undefined') throw new Error('The ZIP library did not load; check the internet connection and reload.');
  const bin = Uint8Array.from(atob(GCS_SCORECARD_TEMPLATE_B64), c => c.charCodeAt(0));
  const zip = await JSZip.loadAsync(bin);
  const read = p => zip.file(p).async('string');
  let dash = await read(GCS_SC_SHEETS.dashboard), cf = await read(GCS_SC_SHEETS.cashflow), cc = await read(GCS_SC_SHEETS.confidence);
  const D = (r, v, o) => { dash = gcsScSetCell(dash, r, v, o); }, C = (r, v, o) => { cf = gcsScSetCell(cf, r, v, o); }, K = (r, v, o) => { cc = gcsScSetCell(cc, r, v, o); };
  const h = data.header, k = v => v / 1000;
  // Dashboard: header, suggestions, currencies, P&L inputs, terms, links
  D('H2', h.customer); D('R2', h.ref); D('H3', h.description); D('R3', h.office); D('H4', h.location); D('R5', h.agent);
  D('B18', data.suggest.tier); D('G18', data.suggest.existing); D('B27', data.suggest.costingConfidenceText);
  D('V27', data.currency.all); D('V29', data.currency.fab); D('V31', data.currency.third);
  D('O51', data.payCcy); D('C53', data.discountPct ? `${+data.discountPct.toFixed(2)}%` : '');
  D('C59', data.money.discount ? -k(data.money.discount) : '');
  D('A72', data.mE); D('A78', data.sA); D('A109', data.mE); D('A115', data.sA);
  D('E64', data.money.freightCost ? k(data.money.freightCost) : ''); D('E101', data.money.freightCost ? k(data.money.freightCost) : '');
  D('C134', data.incoterm); D('X148', data.links.salesforce); D('X150', data.links.sharepoint);
  // CashFlow: values and the section table
  // C9 is the ES equipment value; the template adds the agent (C17) on top in the contract value (C25), so it is taken out here
  C('C9', Math.round(data.money.equipment - data.money.agentCommission)); C('C24', Math.round(data.money.freightSell)); C('C17', Math.round(data.money.agentCommission));
  const pn = data.projectName;
  C('C63', `${pn} (ES Total)`); C('J63', `${pn} (CPM Total)`); C('C74', `${pn} (ES Total)`); C('J74', `${pn} (CPM Total)`);
  ['C65', 'J65', 'C75', 'J75'].forEach(r => C(r, 'Equipment'));
  C('D75', null, { formula: 'C9-D76-D77' }); C('K75', null, { formula: 'C9-K76-K77' });
  C('D76', Math.round(data.money.cpmSell)); C('K76', Math.round(data.money.cpmSell)); C('L76', Math.round(data.money.cpmCost));
  C('D77', 0); C('K77', 0);
  C('D83', Math.round(data.money.freightSell)); C('K83', Math.round(data.money.freightSell)); C('E83', Math.round(data.money.freightCost)); C('L83', Math.round(data.money.freightCost));
  // Costing Confidence: line blocks and provisions
  const writeLine = (r, l) => {
    K(`B${r}`, l.catName || ''); K(`C${r}`, [l.description, l.partNumber && !l.grouped ? `(${l.partNumber})` : ''].filter(Boolean).join(' '));
    K(`D${r}`, '-'); K(`E${r}`, '-'); K(`F${r}`, Math.round(l.cost * 100) / 100); K(`L${r}`, l.rigor); K(`M${r}`, l.supplier || ''); K(`O${r}`, l.confidence);
    const ser = gcsScDateSerial(l.costDate); K(`R${r}`, ser === null ? '' : ser);
    K(`S${r}`, l.inflationPct ? `${+l.inflationPct.toFixed(1)}%` : ''); K(`T${r}`, l.scaling && Math.abs(l.scaling - 1) > 1e-6 ? `${l.scaling.toFixed(2)}×` : '');
    K(`W${r}`, l.grouped ? '' : [l.tab, l.source || 'No source', l.ref].filter(Boolean).join(' · '));
  };
  const summaryOfBlocks = {};
  Object.entries(GCS_SC_SLOTS).forEach(([block, [r0, r1]]) => {
    const fitted = gcsScFit(data.lines.filter(l => l.block === block), r1 - r0 + 1);
    fitted.forEach((l, i) => writeLine(r0 + i, l));
    summaryOfBlocks[block] = { lines: data.lines.filter(l => l.block === block).length, rows: fitted.length };
  });
  K('F41', Math.round(data.prov.startupRisk * 100) / 100); K('F42', Math.round(data.prov.fcaPacking * 100) / 100);
  if (data.prov.duties > 0) { K('C43', 'Import duties (C5 free-issue / H1 country specific)'); K('F43', Math.round(data.prov.duties * 100) / 100); K('L43', 'FACTOR'); }
  zip.file(GCS_SC_SHEETS.dashboard, dash); zip.file(GCS_SC_SHEETS.cashflow, cf); zip.file(GCS_SC_SHEETS.confidence, cc);
  // GCS Lines sheet: notes + every line
  const rows = [
    ['GCS export', `${data.projectName} · ${h.ref} · costs in USD at the project rates · costing date ${data.asOf}`],
    ['Suggested (check)', `Customer segmentation (Dashboard B18), Customer new/existing (G18), Costing confidence (B27): ${data.suggest.costingConfidence || 'n/a'} — ${data.suggest.recentQuotedPct.toFixed(0)}% of cost recently quoted, ${data.suggest.weakPct.toFixed(0)}% estimates or > 5 years old`],
    ['Left for the review team', 'Region (sanctions / representation), relationship health, support to serve, fabricator flexibility, delivery period, liquidated damages, earn-outs, operations hours, delivery schedule, scope type, technical fit and sign-offs, payment terms, cash-flow milestones, contract terms, approvals'],
    data.incotermRaw && !data.incoterm ? ['Incoterm', `${data.incotermRaw} is not one of the scorecard's options (DDP, DAP, FCA/ExWorks); set it on the Dashboard`] : null,
    [],
    ['Tab', 'Block', 'Category', 'Part No.', 'Description', 'Qty', 'Cost USD', 'Sell USD', 'Source', 'Rigor', 'Confidence', 'Supplier', 'Cost date', 'Inflation %', 'Scaling ×', 'Cost reference'],
    ...data.lines.map(l => [l.tab, { fab: 'Fabricated', cpm: 'CPM', third: '3rd Party' }[l.block], [l.cat, l.catName].filter(Boolean).join(' '), l.partNumber, l.description, l.qty,
      Math.round(l.cost * 100) / 100, Math.round(l.sell * 100) / 100, l.source || 'No source', l.rigor, l.confidence, l.supplier, l.costDate, +(+l.inflationPct || 0).toFixed(2), +(+l.scaling || 1).toFixed(3), l.ref]),
  ].filter(Boolean);
  const colL = i => (i < 26 ? String.fromCharCode(65 + i) : 'A' + String.fromCharCode(39 + i));
  const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="18" customWidth="1"/><col min="5" max="5" width="44" customWidth="1"/></cols><sheetData>'
    + rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => { const ref = colL(ci) + (ri + 1); return v === '' || v === null || v === undefined ? '' : typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${gcsScEsc(v)}</t></is></c>`; }).join('') + '</row>').join('')
    + '</sheetData></worksheet>';
  const files = Object.keys(zip.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
  const n = Math.max(...files.map(f => +f.match(/(\d+)\.xml$/)[1])) + 1;
  zip.file(`xl/worksheets/sheet${n}.xml`, sheetXml);
  let wb = await read('xl/workbook.xml'), rels = await read('xl/_rels/workbook.xml.rels'), ct = await read('[Content_Types].xml');
  const rid = 'rId' + (Math.max(...[...rels.matchAll(/Id="rId(\d+)"/g)].map(m => +m[1])) + 1);
  const sid = Math.max(...[...wb.matchAll(/sheetId="(\d+)"/g)].map(m => +m[1])) + 1;
  wb = wb.replace('</sheets>', `<sheet name="GCS Lines" sheetId="${sid}" r:id="${rid}"/></sheets>`);
  rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/></Relationships>`);
  ct = ct.replace('</Types>', `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  zip.file('xl/workbook.xml', wb); zip.file('xl/_rels/workbook.xml.rels', rels); zip.file('[Content_Types].xml', ct);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  return { blob, summary: summaryOfBlocks };
};
