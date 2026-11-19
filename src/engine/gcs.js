

// ═══ GCS COSTING RULES (Excel Global Cost Sheet V3.8 methodology) ════════════
// Reference data and pure functions for the project-costing method taken from the Excel GCS
// (see project doc claude/GCS_EXCEL_LOGIC_MAP.md for the Excel formulas each piece mirrors).
// No React. Used by calcNode (line cost), computePricing (markup) and computeGcsSummary (P&L).

// ── Markup levels: margin on sell, price = cost / (1 − %). Excel plant-section column Z "User Set %". ──
const GCS_MARKUP_LEVELS = ['PASS', 'CPM (A)', 'CPM (B)', 'CROWN (A)', 'CROWN (B)', 'CROWN (C)'];
const GCS_CUSTOM_LEVEL = 'CUSTOM';
const GCS_DEFAULT_MARKUP = { 'PASS': 0, 'CPM (A)': 10, 'CPM (B)': 46.5, 'CROWN (A)': 48, 'CROWN (B)': 60, 'CROWN (C)': 60 };
const GCS_MARKUP_NOTES = {
  'PASS': 'No margin',
  'CPM (A)': 'Business/Equipment (Flakers, C…)',
  'CPM (B)': 'Beta Raven / D&G',
  'CROWN (A)': 'Contribution Margin (A)',
  'CROWN (B)': 'Contribution Margin (B)',
  'CROWN (C)': 'Contribution Margin (C)',
};
const GCS_DEFAULT_LEVEL = 'CROWN (A)';

// ── Mandatory provisions per tab (all sold at PASS = no margin) ──
//   startupRisk: % of the tab's sales (lines + the other provisions)     → category I
//   fcaPacking:  % of the tab's line cost                                 → category G
//   c5Duty:      % of the cost of sub-category C5 lines (free-issue parts) → category H
//   h1Duty:      % of the cost of sub-category H1 lines (country duties)   → category H
const GCS_DEFAULT_PROVISIONS = { startupRisk: 1, fcaPacking: 2, c5Duty: 5.1, h1Duty: 0 };
const GCS_PROVISION_LABELS = {
  startupRisk: 'Start-up Risk Factor', fcaPacking: 'FCA / Packing',
  c5Duty: 'Free Issue Fabricator (C5)', h1Duty: 'Import Duties Country Specific (H1)',
};

// ── Cost categories and sub-categories ──
const GCS_CATEGORIES = [
  { code: 'A', name: 'Fabricated Equipment' }, { code: 'B', name: '3rd Party CPM' },
  { code: 'C', name: '3rd Party Purchase' }, { code: 'D', name: 'Automation' },
  { code: 'E', name: 'Automation Instruments' }, { code: 'F', name: 'Electrical Components' },
  { code: 'G', name: 'Internal Freight' }, { code: 'H', name: 'Import Duties' },
  { code: 'I', name: 'Start-up Risk Factor' },
];
const GCS_SUBCATEGORIES = [
  { code: 'A1', name: 'Pipework & Ducting' }, { code: 'A2', name: 'Fabricated Equipment' },
  { code: 'A3', name: 'Fabricated Vessels' }, { code: 'C1', name: 'Valves & Fittings' },
  { code: 'C2', name: 'Conveyors & Elevators' }, { code: 'C3', name: 'Pumps' },
  { code: 'C4', name: 'Specialist Equipment' }, { code: 'C5', name: 'Crown Free-Issue Parts' },
  { code: 'H1', name: 'Import Duties (Country Specific)' },
];

// ── Bid locations (Excel Engine A:C): M&E and S&A as % of sales ──
const GCS_BID_LOCATIONS = [
  { name: 'Americas - USA', mAndE: 10, sAndA: 10 },
  { name: 'Americas - Brazil', mAndE: 10, sAndA: 10 },
  { name: 'Americas - Argentina', mAndE: 10, sAndA: 10 },
  { name: 'Europe - UK', mAndE: 10, sAndA: 10 },
  { name: 'Asia - China', mAndE: 10, sAndA: 10 },
];

// ── Segments and EBITDA targets (Excel Engine M:O): % for projects over / under $1m ──
const GCS_SEGMENTS = [
  { name: 'Crush (Preparation & Pressing)', over1m: 21, under1m: 30 },
  { name: 'Crush (Extraction)', over1m: 21, under1m: 30 },
  { name: 'Liquids (Refining, Biodiesel, Oleochemicals)', over1m: 20, under1m: 30 },
  { name: 'Liquids (Renewable Diesel Pretreatment)', over1m: 21, under1m: 30 },
  { name: 'Specialty (Protein Concentrate)', over1m: 36, under1m: 45 },
  { name: 'New Innovations', over1m: 41, under1m: 41 },
  { name: 'Expanded Scope', over1m: 30, under1m: 30 },
  { name: 'Specialty Hemp-CBD', over1m: 36, under1m: 45 },
  { name: 'Specialty - All Other', over1m: 36, under1m: 45 },
  { name: 'Aftermarket: POC Crush', over1m: 21, under1m: 30 },
  { name: 'Aftermarket: POC Liquids', over1m: 20, under1m: 30 },
  { name: 'Aftermarket: POC Specialty', over1m: 36, under1m: 45 },
];
const GCS_TARGET_BAND_WIDTH = 5;   // ON TARGET = target to target + 5 points
const GCS_VALUE_THRESHOLD_USD = 1000000;

// ── Project-level defaults ──
const GCS_DEFAULT_INFLATION_PER_MONTH = 0.5;   // % per whole month since the cost date (Excel: DATEDIF(..,"m")*0.5%)
const GCS_DEFAULT_SCALING_EXPONENT = 0.6;      // six-tenths rule: (plant feed / equipment size)^0.6
const GCS_DEFAULT_ROUND_TO = 1000;             // proposal lines rounded UP to this

// Tab settings with defaults filled in. A costing sheet is {id, name, ...gcs settings}.
const gcsSheetSettings = sheet => {
  const s = sheet || {};
  return {
    type: s.type === 'option' ? 'option' : 'section',
    include: s.type === 'option' ? !!s.include : true,
    markup: { ...GCS_DEFAULT_MARKUP, ...(s.markup || {}) },
    defaultLevel: s.defaultLevel || GCS_DEFAULT_LEVEL,
    discount: (s.discount === null || s.discount === undefined || s.discount === '') ? null : Number(s.discount),
    segment: s.segment || '',
    provisions: { ...GCS_DEFAULT_PROVISIONS, ...(s.provisions || {}) },
  };
};

// Map sheetId → settings; items whose sheetId matches no sheet belong to the first sheet.
const gcsSheetIndex = sheets => {
  const list = Array.isArray(sheets) && sheets.length ? sheets : [{ id: 'main', name: 'Sheet 1' }];
  const byId = new Map(list.map(s => [s.id, gcsSheetSettings(s)]));
  const firstId = list[0].id;
  const idOf = item => (item && byId.has(item.sheetId) ? item.sheetId : firstId);
  return { list, byId, firstId, idOf, settingsOf: item => byId.get(idOf(item)) };
};

// Margin % for a line.
//   markupLevel unset   → follows the tab's default level (new lines)
//   markupLevel CUSTOM  → the line's own margin % (also every line in a file from before markup levels,
//                         converted on load by gcsMigrateData so old prices are unchanged)
//   markupLevel a level → that level's % in the tab's markup table
const gcsLevelOf = (item, settings) => item.markupLevel || (settings ? settings.defaultLevel : GCS_DEFAULT_LEVEL);
const gcsMarkupPct = (item, settings) => {
  const level = gcsLevelOf(item, settings);
  if (level === GCS_CUSTOM_LEVEL) return item.margin || 0;
  const pct = settings && settings.markup ? settings.markup[level] : undefined;
  return pct === undefined || pct === null || pct === '' || isNaN(Number(pct)) ? (GCS_DEFAULT_MARKUP[level] || 0) : Number(pct);
};

// Whole months from d1 to d2 (Excel DATEDIF "m"). 0 when either date is missing or d1 is after d2.
const gcsMonthsBetween = (d1, d2) => {
  const a = d1 ? new Date(d1) : null, b = d2 ? new Date(d2) : null;
  if (!a || !b || isNaN(a) || isNaN(b) || a > b) return 0;
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
};
const gcsCostingDate = proj => proj?.costingDate || new Date().toISOString().slice(0, 10);

// Inflation and scaling: automatic like Excel unless the line has its own value.
const gcsAutoInflation = (item, proj) => {
  const rate = proj?.inflationPerMonth ?? GCS_DEFAULT_INFLATION_PER_MONTH;
  return gcsMonthsBetween(item.costDate, gcsCostingDate(proj)) * rate;   // %
};
// Excel rule: automatic scaling only on EQD lines (equipment chosen from the Equipment Quotations Database);
// every other line is 1.00× unless a factor is typed.
const gcsIsEqdLine = item => !!(item && item.eqd && item.eqd.equipment);
const gcsAutoScaling = (item, proj) => {
  if (!gcsIsEqdLine(item)) return 1;
  const feed = Number(proj?.plantFeed) || 0, size = Number(item.sizeCapacity) || 0;
  if (!(feed > 0) || !(size > 0)) return 1;
  return Math.pow(feed / size, proj?.scalingExponent ?? GCS_DEFAULT_SCALING_EXPONENT);
};
const gcsHasValue = v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
const gcsInflationPct = (item, proj) => gcsHasValue(item.inflationPct) ? Number(item.inflationPct) : gcsAutoInflation(item, proj);
const gcsScaling = (item, proj) => gcsHasValue(item.scalingFactor) ? Number(item.scalingFactor) : gcsAutoScaling(item, proj);
// Factor applied to a line's unit cost (Excel: cost_USD × Q × (1 + R)).
const gcsCostFactor = (item, proj) => gcsScaling(item, proj) * (1 + gcsInflationPct(item, proj) / 100);

// Contingency is not part of the GCS method. Files saved before (and PCW quotes) are converted on load:
// the contingency is folded into a Custom margin so the price is unchanged. applyMargins divides by
// (1 − m) and then (1 − c), each only when strictly between 0 and 100, so the combined margin is
// 1 − (1 − m)(1 − c) with the same conditions.
const gcsFoldContingency = item => {
  const c = Number(item.contingency) || 0;
  if (!(c > 0 && c < 100)) return item.contingency ? { ...item, contingency: 0 } : item;
  const m = Number(item.margin) || 0;
  const keepM = m > 0 && m < 100 ? 1 - m / 100 : 1;
  const combined = (1 - keepM * (1 - c / 100)) * 100;
  return { ...item, margin: combined, contingency: 0, markupLevel: GCS_CUSTOM_LEVEL,
    _foldedContingency: { margin: m, contingency: c } };
};

const gcsSegmentTarget = (segment, projectValueUSD) => {
  const s = GCS_SEGMENTS.find(x => x.name === segment);
  if (!s) return null;
  return projectValueUSD > GCS_VALUE_THRESHOLD_USD ? s.over1m : s.under1m;
};
const gcsBand = (ebitdaPct, targetPct) => {
  if (targetPct === null || targetPct === undefined) return '';
  if (ebitdaPct < targetPct) return 'LOW: BELOW TARGET';
  if (ebitdaPct <= targetPct + GCS_TARGET_BAND_WIDTH) return 'ON TARGET';
  return 'HIGH: MORE THAN 5% ABOVE TARGET';
};
const gcsCeil = (v, step) => (step > 0 ? Math.ceil(v / step - 1e-9) * step : v);

// ── Commercial summary: per tab and project, Excel definitions ──
//   COGS  = landed cost of the tab's lines + provisions
//   Sales = line sales (after per-line discount) + provisions (sold at cost)
//   Contribution = Sales − COGS;  M&E = Sales × M&E%;  Gross margin = Contribution − M&E
//   S&A = Sales × S&A%;  EBITDA = Gross margin − S&A
//   Proposal price = Sales rounded UP to roundTo; discount = tab (or project) % × rounded price
//   Project EBITDA = Σ included tabs' EBITDA − discounts; gross margin likewise (Excel L6 = L5 + L4);
//   percentages are of pre-discount sales (Excel Summary K5/K6 divide by J35)
//   Shipping (outbound freight not built into prices) is its own contract line and, as in Excel,
//   is not part of EBITDA.
const computeGcsSummary = ({ tree, sheets, proj, pricing }) => {
  const idx = gcsSheetIndex(sheets);
  const mE = Number(proj.mAndE ?? 10) || 0, sA = Number(proj.sAndAExpense ?? 10) || 0;
  const roundTo = Number(proj.roundTo ?? GCS_DEFAULT_ROUND_TO) || 0;
  const projDiscount = Number(proj.gcsDiscount) || 0;
  const usd = v => conv(v, proj.sellCcy, 'USD', proj.rates);
  const { getAlloc, getItemSP, getItemNetPrice } = pricing;

  const tabs = idx.list.map(sheet => {
    const st = idx.byId.get(sheet.id);
    const roots = tree.filter(n => idx.idOf(n) === sheet.id);
    const lineCost = roots.reduce((s, n) => s + n.totalCOGS, 0);
    const lineLanded = roots.reduce((s, n) => s + getAlloc(n).landed, 0);
    const lineGross = roots.reduce((s, n) => s + getItemSP(n) * (n.qty || 1), 0);
    const lineSales = roots.reduce((s, n) => s + getItemNetPrice(n), 0);
    const subCost = code => roots.filter(n => n.subCat === code).reduce((s, n) => s + n.totalCOGS, 0);
    const p = st.provisions;
    const has = lineCost > 0;
    const fca = has ? lineCost * (Number(p.fcaPacking) || 0) / 100 : 0;
    const c5 = has ? subCost('C5') * (Number(p.c5Duty) || 0) / 100 : 0;
    const h1 = has ? subCost('H1') * (Number(p.h1Duty) || 0) / 100 : 0;
    const startup = has ? (lineSales + fca + c5 + h1) * (Number(p.startupRisk) || 0) / 100 : 0;
    const provisions = { startupRisk: startup, fcaPacking: fca, c5Duty: c5, h1Duty: h1 };
    const provTotal = startup + fca + c5 + h1;
    const cogs = lineLanded + provTotal;
    const sales = lineSales + provTotal;
    const contribution = sales - cogs;
    const mAndE = sales * mE / 100;
    const grossMargin = contribution - mAndE;
    const sAndA = sales * sA / 100;
    const ebitda = grossMargin - sAndA;
    const pct = v => (sales > 0 ? (v / sales) * 100 : 0);
    const price = gcsCeil(sales, roundTo);
    const discountPct = st.discount !== null && !isNaN(st.discount) ? st.discount : projDiscount;
    const discount = price * discountPct / 100;
    return { id: sheet.id, name: sheet.name, ...st, lineCount: roots.length, lineCost, lineLanded, lineGross,
      lineSales, provisions, provTotal, cogs, sales, contribution, mAndE, grossMargin, sAndA, ebitda,
      contributionPct: pct(contribution), grossMarginPct: pct(grossMargin), ebitdaPct: pct(ebitda),
      price, discountPct, discount };
  });

  const included = tabs.filter(t => t.include && t.lineCount > 0);
  const sum = k => included.reduce((s, t) => s + t[k], 0);
  const sales = sum('sales'), cogs = sum('cogs'), discount = sum('discount');
  const projectValueUSD = usd(sum('price'));
  tabs.forEach(t => {
    t.target = gcsSegmentTarget(t.segment || proj.segment, projectValueUSD);
    t.band = t.sales > 0 ? gcsBand(t.ebitdaPct, t.target) : '';
  });
  const targets = included.map(t => t.target).filter(v => v !== null && v !== undefined);
  const target = targets.length ? targets.reduce((s, v) => s + v, 0) / targets.length : null;
  const ebitda = sum('ebitda') - discount;
  const pct = v => (sales > 0 ? (v / sales) * 100 : 0);
  const shippingSell = pricing.distributeOutboundFreight ? 0 : (pricing.totalOutSP || 0);
  const shippingCost = pricing.distributeOutboundFreight ? 0 : (pricing.totalOutCost || 0);
  const shippingPrice = gcsCeil(shippingSell, roundTo);
  const contractBeforeDiscount = sum('price');
  const project = {
    sales, cogs, contribution: sales - cogs, mAndE: sum('mAndE'), grossMargin: sum('grossMargin') - discount, sAndA: sum('sAndA'),
    discount, ebitda, contributionPct: pct(sales - cogs), grossMarginPct: pct(sum('grossMargin') - discount),
    ebitdaPct: pct(ebitda), target, band: sales > 0 ? gcsBand(pct(ebitda), target) : '',
    contractBeforeDiscount, shippingSell, shippingCost, shippingPrice,
    contractValue: contractBeforeDiscount - discount + shippingPrice, projectValueUSD,
  };
  return { tabs, project };
};

// Load-time conversion of files saved before the GCS method (PCW .pcw quotes and GCS v0.1 files).
// Runs once per file: the saved state carries gcsFormat afterwards. Every existing line becomes Custom
// with its old margin, and any contingency is folded into that margin, so no price changes on load.
const GCS_FORMAT = 1;
const gcsMigrateData = d => {
  if (!d || d.gcsFormat >= GCS_FORMAT || !Array.isArray(d.items)) return d;
  const items = d.items.map(i => {
    if (i.type === 'heading') return i;
    const folded = gcsFoldContingency(i);
    return folded.markupLevel ? folded : { ...folded, markupLevel: GCS_CUSTOM_LEVEL };
  });
  return { ...d, items, gcsFormat: GCS_FORMAT };
};


// ═══ AUTOMATIC COST FROM THE FEED, ANY BUSINESS UNIT (Excel GCS latest-cost lookup) ══════════════════════
// The latest positive PO/PQ cost for the part, from whichever BU bought or quoted it (feed costs are in USD),
// fills cost, cost date (so automatic inflation runs from it), supplier (if blank or auto-filled) and the cost
// source location (the BU). A typed cost is never overwritten. If the part has no PO/PQ, a pricelist cost the
// autofill wrote keeps working as before and its BU is recorded as the location.
const GCS_COST_TYPE_SHORT = { 'Purchase Order': 'PO', 'Purchase Quote': 'PQ', Pricelist: 'PL', EQD: 'EQD' };
// Provenance is only shown while the line still holds the cost it describes (a cost changed by paste, fill or
// find & replace then reads as typed).
const gcsCostProvenance = item => {
  const r = item && item.costRef;
  if (!r || !item.costLocation && !r.bu && r.type !== 'EQD') return null;
  if (r.cost !== undefined && Math.abs((Number(item.unitCost) || 0) - Number(r.cost)) > 1e-6) return null;
  if (r.cost !== undefined && (item.ccy || 'USD') !== (r.ccy || 'USD')) return null;
  return { location: item.costLocation || r.bu || '', type: r.type || '', short: GCS_COST_TYPE_SHORT[r.type] || r.type || '', doc: r.doc || '', date: r.date || '', supplier: r.supplier || '', qty: r.qty };
};
const gcsMayAutoCost = item => !gcsIsEqdLine(item) && (!(Number(item.unitCost) > 0) || item._autoPricelist === true || (item._autoCost === true && !!gcsCostProvenance(item)));
// r: the line as it will be after any other autofill updates; lc: DataService.getLatestCost result (or null).
// opts: keepSupplier (quote lines keep theirs), force (bulk refresh that may overwrite typed costs),
// clearIfNone (refresh: remove an automatic cost the feed no longer has), defaultSource.
const gcsCostFillPatch = (r, lc, plEntry, opts = {}) => {
  // EQD lines own their cost: only an explicit choice (the Cost Source picker) replaces it, and that ends EQD mode.
  if (gcsIsEqdLine(r) && !opts.explicit) return null;
  if (!opts.force && !gcsMayAutoCost(r)) return null;
  if (lc && lc.unitCost > 0) {
    const cost = parseFloat(Number(lc.unitCost).toFixed(4));
    const p = { unitCost: cost, ccy: 'USD', costDate: lc.date || '', costLocation: lc.bu || '', source: 'Project Cost',
      costRef: { type: lc.status || '', doc: lc.docNo || '', date: lc.date || '', qty: lc.qty, supplier: lc.supplier || '', bu: lc.bu || '', cost },
      _autoCost: true, _autoPricelist: false, manualSellPrice: null, ...(gcsIsEqdLine(r) ? { eqd: null } : {}) };
    if (!opts.keepSupplier && lc.supplier && (!r.supplier || r._autoSupplier === true)) { p.supplier = lc.supplier; p._autoSupplier = true; }
    return p;
  }
  if (r._autoPricelist === true && plEntry && plEntry.cost !== null && plEntry.cost !== undefined) {
    const cost = parseFloat(parseFloat(plEntry.cost).toFixed(4));
    return { costLocation: plEntry.sourceBU || '', costRef: { type: 'Pricelist', bu: plEntry.sourceBU || '', cost }, _autoCost: false };
  }
  if (opts.clearIfNone && r._autoCost === true) return { unitCost: 0, costDate: '', costLocation: '', costRef: null, _autoCost: false, source: opts.defaultSource || '' };
  return null;
};
const gcsFeedLatestCost = async pn => { try { return pn && DataService.getLatestCost ? await DataService.getLatestCost(pn) : null; } catch (e) { return null; } };

// A cost (or its currency) changed by hand — typing, paste, fill down: the line no longer holds the automatic
// cost, so its provenance is cleared (Excel modManualCostOverride) and a "Project Cost" source is cleared too,
// leaving the source for the user to set (the missing-source check then flags it). A source set in the same
// edit (e.g. a pasted Source column) is kept. Returns the extra fields to merge (empty object if none).
const gcsManualCostPatch = (item, patch) => {
  const out = {};
  const costChanged = patch.unitCost !== undefined && Number(patch.unitCost) !== Number(item.unitCost || 0);
  const ccyChanged = patch.ccy !== undefined && patch.ccy !== (item.ccy || 'USD');
  if (!costChanged && !ccyChanged) return out;
  if (item._autoCost || item.costLocation || item.costRef) { out._autoCost = false; out.costLocation = ''; out.costRef = null; }
  if (costChanged) {
    if (item._autoPricelist) out._autoPricelist = false;
    if (item.source === 'Project Cost' && patch.source === undefined) out.source = '';
  }
  return out;
};

// Inflation traffic light (how stale the reused cost is): < 5% green, 5% to under 10% amber, 10% and over red.
// Lines with no cost date and no typed inflation (nothing to judge) get no colour.
const GCS_INFLATION_BANDS = { amber: 5, red: 10 };
const gcsInflationBand = (pct, item) => {
  const v = Number(pct) || 0;
  if (!(item && (item.costDate || gcsHasValue(item.inflationPct))) && v === 0) return null;
  if (v >= GCS_INFLATION_BANDS.red) return { key: 'red', bg: '#fee2e2', fg: '#991b1b' };
  if (v >= GCS_INFLATION_BANDS.amber) return { key: 'amber', bg: '#fef9c3', fg: '#854d0e' };
  return { key: 'green', bg: '#dcfce7', fg: '#166534' };
};

// Category / sub-category name from its code (the costing column shows codes only; names go in tooltips).
const gcsCategoryName = code => { if (!code) return ''; const x = (code.length === 2 ? GCS_SUBCATEGORIES : GCS_CATEGORIES).find(c => c.code === code); return x ? x.name : ''; };

// Quote-readiness bar colour by % of lines complete: red < 33, amber 33-65, light green 66-99, green 100.
const gcsReadinessColor = pct => (pct >= 100 ? '#16a34a' : pct >= 66 ? '#65a30d' : pct >= 33 ? '#f59e0b' : '#dc2626');


// ═══ EQD: Equipment Quotations Database (Liquids) ═════════════════════════════════════════════════════════
// Excel macros modUnifiedEQDLookup / modLiquidsEQDProduction. Records come from the EQD sheet of the PCW feed
// (DataService.getEqd). A line enters EQD mode when Equipment, Material, Size and Vendor match a quote; the latest
// matching quote fills cost, currency, quote date (cost date → inflation), SAP item, description, model / drawing,
// supplier and size; automatic scaling then applies. Clearing EQD restores what the line held before.
const GCS_EQD_SEGMENT = 'Liquids';
const GCS_EQD_CCY_SYMBOLS = { '$': 'USD', 'US$': 'USD', '£': 'GBP', '€': 'EUR', 'R$': 'BRL', 'RMB': 'CNY', '¥': 'CNY' };
// "USD ($)", "U.S. Dollar (USD)", "EUR (€)", "RMB" → ISO code
const gcsEqdCcy = raw => {
  const s = String(raw || '').trim(); if (!s) return 'USD';
  const up = s.toUpperCase();
  const iso = up.match(/\b(USD|EUR|GBP|BRL|ARS|CNY|JPY|AUD|CAD|MXN|SGD|NOK|SEK|INR|CHF)\b/);
  if (iso) return iso[1];
  return GCS_EQD_CCY_SYMBOLS[s] || GCS_EQD_CCY_SYMBOLS[up] || (/^[A-Z]{3}$/.test(up) ? up : 'USD');
};
// Excel ValuesMatch: numeric if both numeric, else trimmed case-insensitive text
const gcsEqdSame = (a, b) => {
  const na = Number(a), nb = Number(b);
  if (String(a ?? '').trim() !== '' && String(b ?? '').trim() !== '' && !isNaN(na) && !isNaN(nb)) return Math.abs(na - nb) < 1e-7;
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
};
const gcsEqdSizeLabel = r => (r.size === '' || r.size === null || r.size === undefined ? '' : String(r.size) + (r.sizeUnits ? ' ' + r.sizeUnits : ''));
// Quotes matching the selection (blank fields = any), newest first; text filters any field
const gcsEqdQuery = (records, sel = {}) => {
  const q = String(sel.text || '').trim().toLowerCase();
  const out = (records || []).filter(r => (!sel.equipment || gcsEqdSame(r.equipment, sel.equipment)) && (!sel.material || gcsEqdSame(r.material, sel.material))
    && (sel.size === undefined || sel.size === '' || sel.size === null || gcsEqdSame(r.size, sel.size)) && (!sel.vendor || gcsEqdSame(r.vendor, sel.vendor))
    && (!q || [r.equipment, r.material, r.vendor, r.description, r.drawing, r.sap, r.quoteNo, r.category].some(v => String(v || '').toLowerCase().includes(q))));
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || (Number(b.id) || 0) - (Number(a.id) || 0));
};
const gcsEqdLatest = (records, sel) => (sel && sel.equipment && sel.material && sel.vendor && sel.size !== '' && sel.size !== undefined ? gcsEqdQuery(records, sel)[0] || null : null);
// Cascading choices: materials for the equipment, sizes for equipment + material, vendors for all three
const gcsEqdOptions = (records, sel = {}) => {
  const uniq = (arr, key) => { const m = new Map(); arr.forEach(r => { const v = r[key]; if (v === '' || v === null || v === undefined) return; const k = String(v).trim().toLowerCase(); if (!m.has(k)) m.set(k, v); }); return [...m.values()]; };
  const byText = (a, b) => String(a).localeCompare(String(b));
  const all = records || [];
  const e = sel.equipment ? all.filter(r => gcsEqdSame(r.equipment, sel.equipment)) : [];
  const em = sel.material ? e.filter(r => gcsEqdSame(r.material, sel.material)) : [];
  const ems = sel.size !== undefined && sel.size !== '' && sel.size !== null ? em.filter(r => gcsEqdSame(r.size, sel.size)) : [];
  return { equipment: uniq(all, 'equipment').sort(byText), material: uniq(e, 'material').sort(byText),
    size: uniq(em, 'size').sort((a, b) => (Number(a) - Number(b)) || byText(a, b)), vendor: uniq(ems, 'vendor').sort(byText) };
};
// Price in an app currency: kept if the app supports it; otherwise converted to USD with the project rates
// (per 1 USD). Returns null when there is no rate for it.
const gcsEqdPrice = (rec, rates) => {
  const ccy = rec.ccy || 'USD', price = Number(rec.price) || 0;
  if (CURRENCIES.includes(ccy)) return { unitCost: price, ccy, converted: null };
  const r = rates && Number(rates[ccy]);
  if (!(r > 0)) return null;
  return { unitCost: parseFloat((price / r).toFixed(4)), ccy: 'USD', converted: { from: ccy, price, rate: r } };
};
const GCS_EQD_PREV_FIELDS = ['partNumber', 'description', 'drawingNumber', 'supplier', 'unitCost', 'ccy', 'costDate', 'source', 'sizeCapacity', 'scalingFactor', 'costLocation', 'costRef', '_autoCost', '_autoSupplier', '_autoDescription', '_autoDrawing', '_autoPricelist'];
const gcsEqdPatch = (item, rec, rates) => {
  const pr = gcsEqdPrice(rec, rates);
  if (!pr) return null;
  const prev = item.eqd && item.eqd.prev ? item.eqd.prev : Object.fromEntries(GCS_EQD_PREV_FIELDS.map(k => [k, item[k] === undefined ? null : item[k]]));
  return {
    eqd: { equipment: rec.equipment, material: rec.material, size: rec.size, vendor: rec.vendor, id: rec.id ?? null, quoteNo: rec.quoteNo || '', vendorUrl: rec.vendorUrl || '',
      drawingUrl: rec.drawingUrl || '', category: rec.category || '', sizeUnits: rec.sizeUnits || '', converted: pr.converted, prev },
    partNumber: rec.sap ? String(rec.sap) : (item.partNumber || ''), description: rec.description || item.description || '', drawingNumber: rec.drawing || item.drawingNumber || '',
    supplier: rec.vendor || item.supplier || '', sizeCapacity: Number(rec.size) || 0, scalingFactor: null,
    unitCost: pr.unitCost, ccy: pr.ccy, costDate: rec.date || '', source: 'EQD', manualSellPrice: null,
    costLocation: rec.bidOffice || '', costRef: { type: 'EQD', doc: rec.quoteNo || '', date: rec.date || '', supplier: rec.vendor || '', bu: rec.bidOffice || '', cost: pr.unitCost, ccy: pr.ccy, url: rec.vendorUrl || '' },
    _autoCost: false, _autoPricelist: false, _autoSupplier: false, _autoDescription: !!rec.description, _autoDrawing: !!rec.drawing,
  };
};
// Leave EQD mode: restore the fields the line held before it entered
const gcsEqdClearPatch = item => {
  const prev = (item.eqd && item.eqd.prev) || {};
  const out = { eqd: null };
  GCS_EQD_PREV_FIELDS.forEach(k => { out[k] = prev[k] === undefined ? null : prev[k]; });
  ['partNumber', 'description', 'drawingNumber', 'supplier', 'source', 'costDate', 'costLocation'].forEach(k => { if (out[k] === null) out[k] = ''; });
  if (out.unitCost === null) out.unitCost = 0; if (out.ccy === null) out.ccy = 'USD'; if (out.sizeCapacity === null) out.sizeCapacity = 0;
  return out;
};
