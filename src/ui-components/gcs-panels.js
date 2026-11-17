
// ═══ GCS PANELS ═══════════════════════════════════════════════════════════════
// Tab settings (above the costing table), project settings (Setup) and the commercial summary
// (Summary tab). Hand-written in compiled form (React.createElement) like the rest of this folder.
// Calculations come from engine/gcs.js (computeGcsSummary); these components only display and edit.

var gcsH = React.createElement;
var gcsLabel = (text, tip) => gcsH("div", { style: { fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }, title: tip || undefined }, text);
var gcsMoney = (v, ccy) => fc(v) + (ccy ? " " + ccy : "");
var gcsBandColor = band => band.startsWith('LOW') ? '#dc2626' : band.startsWith('ON') ? '#16a34a' : band.startsWith('HIGH') ? '#2563eb' : '#64748b';
var gcsBandShort = band => band.startsWith('LOW') ? 'LOW' : band.startsWith('ON') ? 'ON TARGET' : band.startsWith('HIGH') ? 'HIGH' : '—';
var gcsPctInput = (value, onChange, disabled, title, width) => gcsH(NumInput, { className: "pcw-input pcw-mono text-xs", style: { width: width || 64, textAlign: 'right', padding: '3px 6px' }, value: value, min: 0, max: 100, isPercent: true, disabled, title,
  onChange: v => { if (!disabled && Number(v) !== Number(value)) onChange(Number(v) || 0); } });

// ── Tab settings: shown above the costing table for the active tab ──
var GcsTabSettings = memo(function GcsTabSettings({ sheet, setCostingSheets, locked, summ, sellCcy, proj }) {
  var [open, setOpen] = useState(false);
  if (!sheet) return null;
  var st = gcsSheetSettings(sheet);
  var upd = patch => { if (!locked) setCostingSheets(prev => prev.map(s => s.id === sheet.id ? { ...s, ...patch } : s)); };
  var segDefault = proj.segment ? `Project default (${proj.segment})` : 'Project default (none set)';
  var discLabel = st.discount === null ? `project ${fp(Number(proj.gcsDiscount) || 0)}` : fp(st.discount);
  var band = summ && summ.band ? summ.band : '';
  var chip = (txt, color, bg) => gcsH("span", { style: { fontSize: 10.5, padding: '1px 7px', borderRadius: 10, background: bg || '#f1f5f9', color: color || '#334155', whiteSpace: 'nowrap' } }, txt);
  return gcsH("div", { className: "pcw-card", style: { padding: '8px 12px' }, "data-gcs": "tab-settings" },
    gcsH("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }, onClick: () => setOpen(o => !o) },
      gcsH("span", { style: { fontSize: 12, fontWeight: 700, color: 'var(--pcw-text-primary)' } }, (open ? "▾ " : "▸ ") + "Tab settings"),
      chip(st.type === 'option' ? (st.include ? 'Option · included' : 'Option · not included') : 'Plant section', st.type === 'option' && !st.include ? '#92400e' : undefined, st.type === 'option' && !st.include ? '#fef3c7' : undefined),
      chip('Default ' + st.defaultLevel), chip('Discount ' + discLabel),
      chip('Provisions ' + [fp(st.provisions.startupRisk), fp(st.provisions.fcaPacking), fp(st.provisions.c5Duty), fp(st.provisions.h1Duty)].join(' / ')),
      summ && summ.lineCount > 0 ? gcsH(React.Fragment, null,
        gcsH("span", { style: { marginLeft: 'auto', fontSize: 11, color: '#475569' } }, "COGS ", gcsH("b", { className: "pcw-mono" }, gcsMoney(summ.cogs)), " · Sales ", gcsH("b", { className: "pcw-mono" }, gcsMoney(summ.sales, sellCcy)), " · EBITDA ", gcsH("b", { className: "pcw-mono", style: { color: gcsBandColor(band) } }, fp(summ.ebitdaPct))),
        summ.target !== null ? chip(`${gcsBandShort(band)} vs ${fp(summ.target)}`, '#fff', gcsBandColor(band)) : chip('No segment', '#92400e', '#fef3c7')) : null),
    open && gcsH("div", { style: { display: 'grid', gridTemplateColumns: 'minmax(200px,1fr) minmax(320px,1.6fr) minmax(260px,1.3fr)', gap: 16, marginTop: 10 } },
      // Column 1: type, segment, default level, discount
      gcsH("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        gcsH("div", null, gcsLabel('Tab type', 'Plant sections are always in the price. Options count only when included.'),
          gcsH("div", { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            gcsH("select", { className: "pcw-input text-xs", value: st.type, disabled: locked, onChange: e => upd({ type: e.target.value, include: e.target.value === 'option' ? !!sheet.include : undefined }) },
              gcsH("option", { value: 'section' }, 'Plant section'), gcsH("option", { value: 'option' }, 'Option')),
            st.type === 'option' && gcsH("label", { style: { fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' } },
              gcsH("input", { type: 'checkbox', checked: st.include, disabled: locked, onChange: e => upd({ include: e.target.checked }) }), 'Include in price'))),
        gcsH("div", null, gcsLabel('Segment', 'Sets the EBITDA target for this tab (Excel Engine segment table). Blank = the project segment.'),
          gcsH("select", { className: "pcw-input text-xs", value: sheet.segment || '', disabled: locked, onChange: e => upd({ segment: e.target.value }), style: { width: '100%' } },
            gcsH("option", { value: '' }, segDefault), GCS_SEGMENTS.map(sg => gcsH("option", { key: sg.name, value: sg.name }, `${sg.name} (${sg.over1m}% / ${sg.under1m}%)`)))),
        gcsH("div", null, gcsLabel('Default markup level', 'Lines set to "Default" use this level.'),
          gcsH("select", { className: "pcw-input text-xs", value: st.defaultLevel, disabled: locked, onChange: e => upd({ defaultLevel: e.target.value }) },
            GCS_MARKUP_LEVELS.map(l => gcsH("option", { key: l, value: l }, `${l} (${fp(st.markup[l])})`)))),
        gcsH("div", null, gcsLabel('Tab discount %', 'Leave blank to use the project discount (Setup). Applied to the tab price after rounding.'),
          gcsH("div", { style: { display: 'flex', gap: 6, alignItems: 'center' } },
            gcsH("input", { className: "pcw-input pcw-mono text-xs", style: { width: 70, textAlign: 'right' }, disabled: locked, placeholder: fp(Number(proj.gcsDiscount) || 0),
              defaultValue: st.discount === null ? '' : String(st.discount), key: sheet.id + '-disc-' + (st.discount === null ? 'p' : st.discount),
              onBlur: e => { var t = e.target.value.trim().replace('%', ''); if (t === '') { if (st.discount !== null) upd({ discount: null }); return; } var v = parseFloat(t); if (!isNaN(v) && v >= 0 && v <= 100 && v !== st.discount) upd({ discount: v }); } }),
            gcsH("span", { style: { fontSize: 10.5, color: '#64748b' } }, st.discount === null ? 'using project discount' : 'overrides project')))),
      // Column 2: markup table
      gcsH("div", null, gcsLabel('Markup levels (margin on sell, editable per tab)', 'Changing a % reprices every line on this tab set to that level. Price = cost ÷ (1 − %).'),
        gcsH("table", { style: { width: '100%', fontSize: 11.5, borderCollapse: 'collapse' } }, gcsH("tbody", null,
          GCS_MARKUP_LEVELS.map(l => gcsH("tr", { key: l, style: { borderBottom: '1px solid var(--pcw-border, #e2e8f0)' } },
            gcsH("td", { style: { padding: '3px 4px', fontWeight: 600, whiteSpace: 'nowrap' } }, l),
            gcsH("td", { style: { padding: '3px 4px', color: '#64748b', fontSize: 10.5 } }, GCS_MARKUP_NOTES[l]),
            gcsH("td", { style: { padding: '2px 4px', textAlign: 'right', whiteSpace: 'nowrap' } },
              gcsPctInput(st.markup[l], v => upd({ markup: { ...(sheet.markup || {}), [l]: v } }), locked, `${l} margin % on sell`),
              Number(st.markup[l]) !== GCS_DEFAULT_MARKUP[l] ? gcsH("span", { title: `Standard is ${fp(GCS_DEFAULT_MARKUP[l])}`, style: { color: '#b45309', fontSize: 10, marginLeft: 4 } }, `std ${fp(GCS_DEFAULT_MARKUP[l])}`) : null)))))),
      // Column 3: provisions
      gcsH("div", null, gcsLabel('Mandatory provisions (no margin)', 'Added to this tab as cost and sale at cost (PASS). Excel plant-section rows below the sub-total.'),
        gcsH("table", { style: { width: '100%', fontSize: 11.5, borderCollapse: 'collapse' } }, gcsH("tbody", null,
          [['startupRisk', '% of tab sales'], ['fcaPacking', '% of tab line cost'], ['c5Duty', '% of C5 line cost'], ['h1Duty', '% of H1 line cost']].map(([k, basis]) => gcsH("tr", { key: k, style: { borderBottom: '1px solid var(--pcw-border, #e2e8f0)' } },
            gcsH("td", { style: { padding: '3px 4px' } }, GCS_PROVISION_LABELS[k], gcsH("div", { style: { fontSize: 10, color: '#94a3b8' } }, basis)),
            gcsH("td", { style: { padding: '2px 4px', textAlign: 'right' } }, gcsPctInput(st.provisions[k], v => upd({ provisions: { ...(sheet.provisions || {}), [k]: v } }), locked, GCS_PROVISION_LABELS[k] + ' %', 58)),
            gcsH("td", { className: "pcw-mono", style: { padding: '3px 4px', textAlign: 'right', whiteSpace: 'nowrap', color: '#334155' } }, summ ? gcsMoney(summ.provisions[k]) : '')))),
          summ ? gcsH("tfoot", null, gcsH("tr", null, gcsH("td", { style: { padding: '3px 4px', fontWeight: 700 } }, 'Total'), gcsH("td", null), gcsH("td", { className: "pcw-mono", style: { padding: '3px 4px', textAlign: 'right', fontWeight: 700 } }, gcsMoney(summ.provTotal, sellCcy)))) : null))));
});

// ── Project settings (Setup tab) ──
var GcsProjectSettings = function GcsProjectSettings({ proj, setLockedProj }) {
  var locked = !!proj.locked;
  var set = (k, v) => setLockedProj(p => ({ ...p, [k]: v }));
  var num = (k, v) => set(k, v === '' || v === null ? null : Number(v));
  var field = (label, tip, input) => gcsH("div", null, gcsLabel(label, tip), input);
  var loc = GCS_BID_LOCATIONS.find(b => b.name === proj.bidLocation);
  var numBox = (k, dflt, opts = {}) => gcsH(NumInput, { className: "pcw-input pcw-mono", style: { width: '100%', textAlign: 'right' }, value: proj[k] ?? dflt, min: 0, disabled: locked, ...opts,
    onChange: v => { if (!locked && Number(v) !== Number(proj[k] ?? dflt)) num(k, v); } });
  return gcsH(Card, null,
    gcsH(H3, null, "GCS Costing Method"),
    gcsH("div", { className: "pcw-grid-2 gap-3", "data-gcs": "project-settings" },
      field('Bid location', 'Sets M&E and S&A from the Excel Engine table. You can still edit both after choosing.',
        gcsH("select", { className: "pcw-input", value: proj.bidLocation || '', disabled: locked, onChange: e => { var b = GCS_BID_LOCATIONS.find(x => x.name === e.target.value); setLockedProj(p => ({ ...p, bidLocation: e.target.value, ...(b ? { mAndE: b.mAndE, sAndAExpense: b.sAndA } : {}) })); } },
          gcsH("option", { value: '' }, 'Select office…'), GCS_BID_LOCATIONS.map(b => gcsH("option", { key: b.name, value: b.name }, b.name)))),
      field('Segment', 'Project segment for the EBITDA target. Tabs can override it.',
        gcsH("select", { className: "pcw-input", value: proj.segment || '', disabled: locked, onChange: e => set('segment', e.target.value) },
          gcsH("option", { value: '' }, 'Select segment…'), GCS_SEGMENTS.map(sg => gcsH("option", { key: sg.name, value: sg.name }, `${sg.name} (${sg.over1m}% >$1m / ${sg.under1m}% <$1m)`)))),
      field('M&E % of sales', loc && Number(proj.mAndE ?? 10) !== loc.mAndE ? `Bid location standard is ${loc.mAndE}%` : 'Manufacturing & Engineering, % of sales. Deducted before gross margin.', numBox('mAndE', 10, { max: 100, isPercent: true })),
      field('S&A % of sales', 'Sales & Administration, % of sales. Deducted from gross margin to give EBITDA.', numBox('sAndAExpense', 10, { max: 100, isPercent: true })),
      field('Project discount %', 'Applied to each tab price after rounding. A tab can set its own.', numBox('gcsDiscount', 0, { max: 100, isPercent: true })),
      field('Round tab prices up to', 'Each plant section / option price is rounded UP to this amount (Excel: 1,000).', numBox('roundTo', GCS_DEFAULT_ROUND_TO)),
      field('Plant feed / capacity', 'Plant size used by the automatic scaling factor: (plant feed ÷ equipment size)^exponent. Use the same unit as the line sizes.', numBox('plantFeed', 0)),
      field('Scaling exponent', 'Six-tenths rule by default (0.6).', numBox('scalingExponent', GCS_DEFAULT_SCALING_EXPONENT)),
      field('Inflation % per month', 'Automatic inflation = whole months from the cost date to the costing date × this rate (Excel: 0.5%).', numBox('inflationPerMonth', GCS_DEFAULT_INFLATION_PER_MONTH)),
      field('Costing date', 'Inflation is measured up to this date. Blank = today (as Excel), which means an unlocked estimate keeps inflating; set a date to freeze it.',
        gcsH("div", { style: { display: 'flex', gap: 6, alignItems: 'center' } },
          gcsH("input", { type: 'date', className: "pcw-input", value: proj.costingDate || '', disabled: locked, onChange: e => set('costingDate', e.target.value || '') }),
          !proj.costingDate && gcsH("span", { style: { fontSize: 10.5, color: '#b45309' } }, 'today')))));
};

// ── Commercial summary (Summary tab) ──
var GcsSummaryCard = function GcsSummaryCard({ gcsSummary, proj }) {
  if (!gcsSummary) return null;
  var { tabs, project: P } = gcsSummary;
  var ccy = proj.sellCcy;
  var th = (t, right) => gcsH("th", { style: { padding: '5px 8px', textAlign: right ? 'right' : 'left', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid var(--pcw-border, #e2e8f0)' } }, t);
  var td = (v, o = {}) => gcsH("td", { className: o.mono === false ? undefined : "pcw-mono", style: { padding: '5px 8px', textAlign: o.left ? 'left' : 'right', fontWeight: o.bold ? 700 : 400, color: o.color, whiteSpace: 'nowrap', fontSize: 12 } }, v);
  var shown = tabs.filter(t => t.lineCount > 0 || t.include);
  var plRow = (label, val, pct, o = {}) => gcsH("tr", { style: { borderTop: o.top ? '1px solid var(--pcw-border, #e2e8f0)' : undefined, background: o.bg } },
    gcsH("td", { style: { padding: '4px 8px', fontSize: 12, fontWeight: o.bold ? 700 : 400, paddingLeft: o.indent ? 20 : 8 } }, label), td(gcsMoney(val, ccy), { bold: o.bold, color: o.color }), td(pct === null ? '' : fp(pct), { color: '#64748b' }));
  return gcsH(Card, null,
    gcsH("div", { "data-gcs": "summary" },
      gcsH(H3, null, "GCS Commercial Summary"),
      gcsH("table", { style: { width: '100%', borderCollapse: 'collapse', marginBottom: 14 } },
        gcsH("thead", null, gcsH("tr", null, th('Tab'), th('Type'), th('COGS', 1), th('Sales', 1), th('Contribution', 1), th('EBITDA', 1), th('EBITDA %', 1), th('Target', 1), th('Band'), th('Price (rounded)', 1), th('Discount', 1))),
        gcsH("tbody", null, shown.map(t => gcsH("tr", { key: t.id, style: { borderBottom: '1px solid var(--pcw-border, #e2e8f0)', opacity: t.include ? 1 : 0.55 } },
          td(t.name, { left: true, mono: false, bold: true }), td(t.type === 'option' ? (t.include ? 'Option' : 'Option (excluded)') : 'Section', { left: true, mono: false, color: '#64748b' }),
          td(gcsMoney(t.cogs)), td(gcsMoney(t.sales)), td(gcsMoney(t.contribution)), td(gcsMoney(t.ebitda)), td(fp(t.ebitdaPct), { color: gcsBandColor(t.band) }),
          td(t.target === null ? '—' : fp(t.target), { color: '#64748b' }), td(gcsBandShort(t.band), { left: true, mono: false, color: gcsBandColor(t.band), bold: true }),
          td(gcsMoney(t.price), { bold: true }), td(t.discount ? '−' + gcsMoney(t.discount) + ' (' + fp(t.discountPct) + ')' : '—', { color: '#64748b' }))))),
      gcsH("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 } },
        gcsH("table", { style: { width: '100%', borderCollapse: 'collapse', alignSelf: 'start' } }, gcsH("tbody", null,
          gcsH("tr", null, gcsH("td", { colSpan: 3, style: { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '0 8px 4px' } }, 'Project P&L (Excel GCS definitions)')),
          plRow('Sales (sections + included options)', P.sales, 100, { bold: true }),
          plRow('Cost of goods (incl. provisions)', P.cogs, P.sales ? P.cogs / P.sales * 100 : 0, { indent: true }),
          plRow('Contribution margin', P.contribution, P.contributionPct, { top: true }),
          plRow('Manufacturing & Engineering', P.mAndE, P.sales ? P.mAndE / P.sales * 100 : 0, { indent: true }),
          P.discount ? plRow('Discount', -P.discount, P.sales ? -P.discount / P.sales * 100 : 0, { indent: true }) : null,
          plRow('Gross margin', P.grossMargin, P.grossMarginPct, { top: true }),
          plRow('Sales & Administration', P.sAndA, P.sales ? P.sAndA / P.sales * 100 : 0, { indent: true }),
          plRow('EBITDA', P.ebitda, P.ebitdaPct, { top: true, bold: true, color: gcsBandColor(P.band), bg: 'var(--pcw-surface-2, #f8fafc)' }),
          gcsH("tr", null, gcsH("td", { colSpan: 3, style: { padding: '6px 8px', fontSize: 11.5 } },
            P.target === null ? gcsH("span", { style: { color: '#b45309' } }, 'No segment set: choose one in Setup (or per tab) to see the EBITDA target.')
              : gcsH("span", null, 'Target ', gcsH("b", null, fp(P.target)), ` (average of the tabs' segment targets, project ${P.projectValueUSD > GCS_VALUE_THRESHOLD_USD ? 'over' : 'under'} $1m) → `, gcsH("b", { style: { color: gcsBandColor(P.band) } }, P.band)))))),
        gcsH("table", { style: { width: '100%', borderCollapse: 'collapse', alignSelf: 'start' } }, gcsH("tbody", null,
          gcsH("tr", null, gcsH("td", { colSpan: 2, style: { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '0 8px 4px' } }, 'Contract value' + (proj.incoterm ? ' · ' + proj.incoterm : ''))),
          tabs.filter(t => t.include && t.lineCount > 0).map(t => gcsH("tr", { key: t.id }, gcsH("td", { style: { padding: '3px 8px', fontSize: 12 } }, t.name), td(gcsMoney(t.price, ccy)))),
          gcsH("tr", { style: { borderTop: '1px solid var(--pcw-border, #e2e8f0)' } }, gcsH("td", { style: { padding: '4px 8px', fontSize: 12 } }, 'Contract value (rounded)'), td(gcsMoney(P.contractBeforeDiscount, ccy))),
          P.discount ? gcsH("tr", null, gcsH("td", { style: { padding: '3px 8px', fontSize: 12 } }, 'Discount'), td('−' + gcsMoney(P.discount, ccy))) : null,
          P.shippingPrice ? gcsH("tr", null, gcsH("td", { style: { padding: '3px 8px', fontSize: 12 } }, 'Shipping & freight (outbound, rounded; not in EBITDA)'), td(gcsMoney(P.shippingPrice, ccy))) : null,
          gcsH("tr", { style: { borderTop: '2px solid var(--pcw-border, #e2e8f0)' } }, gcsH("td", { style: { padding: '6px 8px', fontSize: 13, fontWeight: 700 } }, 'Total contract value'), td(gcsMoney(P.contractValue, ccy), { bold: true, color: '#b45309' })))))));
};
