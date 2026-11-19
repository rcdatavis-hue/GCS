
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

// ── Costing confidence (PCW rule): cost-weighted score of the line sources → rate % and Very Low..Very High ──
var gcsConfTip = (mix, ccy) => 'Costing confidence: ' + mix.label + ' (' + fp(mix.rate) + ')\nWeighted by line cost; source scores out of 5:\n'
  + mix.parts.map(p => `${p.label} (score ${p.weight}): ${fp(p.pct)} of cost, ${gcsMoney(p.cost, ccy)}`).join('\n');
var GcsConfidenceStrip = function GcsConfidenceStrip({ mix, width, height, legend, ccy, id }) {
  if (!mix || !(mix.total > 0)) return gcsH("span", { style: { fontSize: 10.5, color: '#94a3b8' } }, 'no cost yet');
  var tip = gcsConfTip(mix, ccy);
  return gcsH("span", { title: tip, "data-gcs-confidence": id || '', "data-conf-rate": mix.rate.toFixed(1), "data-conf-label": mix.label, style: { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 } },
    gcsH("span", { style: { display: 'inline-block', width: width || 80, height: height || 7, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden', flexShrink: 0 } },
      gcsH("span", { style: { display: 'block', width: Math.max(0, Math.min(100, mix.rate)) + '%', height: '100%', background: mix.color } })),
    gcsH("span", { style: { fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, color: '#fff', background: mix.color, whiteSpace: 'nowrap' } }, mix.label),
    gcsH("span", { className: "pcw-mono", style: { fontSize: 10.5, color: '#475569' } }, fp(mix.rate)),
    legend === 'full' ? gcsH("span", { style: { fontSize: 10.5, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
      mix.parts.map((p, k) => gcsH(React.Fragment, { key: p.source }, k ? ' \u00B7 ' : '', gcsH("span", { "data-conf-part": p.label, "data-conf-pct": p.pct.toFixed(1), style: { display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: p.color, marginRight: 3, verticalAlign: 'middle' } }), `${p.label} ${Math.round(p.pct)}%`))) : null);
};

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
    gcsH("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', overflow: 'hidden', whiteSpace: 'nowrap', cursor: 'pointer' }, onClick: () => setOpen(o => !o) },
      gcsH("span", { style: { fontSize: 12, fontWeight: 700, color: 'var(--pcw-text-primary)' } }, (open ? "▾ " : "▸ ") + "Tab settings"),
      chip(st.type === 'option' ? (st.include ? 'Option · included' : 'Option · not included') : 'Plant section', st.type === 'option' && !st.include ? '#92400e' : undefined, st.type === 'option' && !st.include ? '#fef3c7' : undefined),
      chip('Default ' + st.defaultLevel), chip('Discount ' + discLabel),
      chip('Provisions ' + [fp(st.provisions.startupRisk), fp(st.provisions.fcaPacking), fp(st.provisions.c5Duty), fp(st.provisions.h1Duty)].join(' / ')),
      summ && summ.lineCount > 0 ? gcsH(React.Fragment, null,
        gcsH("span", { style: { marginLeft: 'auto', fontSize: 11, color: '#475569' } }, "COGS ", gcsH("b", { className: "pcw-mono" }, gcsMoney(summ.cogs)), " · Sales ", gcsH("b", { className: "pcw-mono" }, gcsMoney(summ.sales, sellCcy)), " · EBITDA ", gcsH("b", { className: "pcw-mono", style: { color: gcsBandColor(band) } }, fp(summ.ebitdaPct))),
        summ.target !== null ? chip(`${gcsBandShort(band)} vs ${fp(summ.target)}`, '#fff', gcsBandColor(band)) : chip('No segment', '#92400e', '#fef3c7'),
        gcsH("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4 } }, gcsH("span", { style: { fontSize: 10.5, color: '#64748b' } }, 'Confidence'), gcsH(GcsConfidenceStrip, { mix: summ.confidence, width: 70, ccy: sellCcy, id: 'tab' }))) : null),
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
      field('Round tab prices up to', 'Each plant section / option price is rounded UP to this amount (Excel: 1,000).', numBox('roundTo', GCS_DEFAULT_ROUND_TO)),
      field('Plant feed / capacity', 'Plant size used by the automatic scaling factor: (plant feed ÷ equipment size)^exponent. Use the same unit as the line sizes.', numBox('plantFeed', 0)),
      field('Scaling exponent', 'Six-tenths rule by default (0.6).', numBox('scalingExponent', GCS_DEFAULT_SCALING_EXPONENT)),
      field('Inflation % per month', 'Automatic inflation = whole months from the cost date to the costing date × this rate (Excel: 0.5%).', numBox('inflationPerMonth', GCS_DEFAULT_INFLATION_PER_MONTH)),
      field('Costing date', 'Inflation is measured up to this date. Blank = today (as Excel), which means an unlocked estimate keeps inflating; set a date to freeze it.',
        gcsH("div", { style: { display: 'flex', gap: 6, alignItems: 'center' } },
          gcsH("input", { type: 'date', className: "pcw-input", value: proj.costingDate || '', disabled: locked, onChange: e => set('costingDate', e.target.value || '') }),
          !proj.costingDate && gcsH("span", { style: { fontSize: 10.5, color: '#b45309' } }, 'today')))),
    // Discounts & commissions (was the PCW "Default Margins & Settings" card)
    gcsH("div", { style: { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', margin: '16px 0 8px', paddingTop: 12, borderTop: '1px solid var(--pcw-border, #e2e8f0)' } }, "Discounts & commissions"),
    gcsH("div", { className: "pcw-grid-2 gap-3", "data-gcs": "discounts" },
      field('Project discount %', 'Discount offered to the customer, as in the Excel Summary: taken off each tab price after rounding up. A tab can set its own % in Tab settings.', numBox('gcsDiscount', 0, { max: 100, isPercent: true, "data-gcs-field": "gcsDiscount" })),
      field('Discount mitigation %', 'Builds a buffer into every sell price so that a later customer discount of this % still keeps your margin: sell ÷ (1 − mitigation). Separate from the project discount above.', numBox('discountMitigation', 0, { max: 100, isPercent: true })),
      field('Dealer / agent %', 'Commission paid to a dealer or sales agent, built into every sell price: sell ÷ (1 − dealer). Set to 0 if no agent is involved.', numBox('defaultDealer', 0, { max: 100, isPercent: true })),
      field('Default cost source', 'Source pre-filled on new lines (sets the cost confidence). Autofilled costs set their own source.',
        gcsH("select", { className: "pcw-input", value: proj.source || '', disabled: locked, onChange: e => set('source', e.target.value) },
          gcsH("option", { value: '' }, '\u2014 select \u2014'), SOURCES.filter(x => x !== '').map(x => gcsH("option", { key: x, value: x }, x))))));
};

// ── Commercial summary (Summary tab) ──
var GcsSummaryCard = function GcsSummaryCard({ gcsSummary, proj, setLockedProj }) {
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
      gcsH("div", { "data-gcs": "confidence", style: { marginBottom: 14 } },
        gcsH("div", { style: { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '0 8px 6px' }, title: 'Cost-weighted average of the line sources. Scores out of 5: Quotation 5, Pricelist 4, Project Cost / EQD / ICUG 3, Estimate 2, no source 0.' }, 'Costing confidence (cost-weighted source score: Quotation 5 \u00B7 Pricelist 4 \u00B7 Project Cost / EQD / ICUG 3 \u00B7 Estimate 2 \u00B7 none 0)'),
        gcsH("div", { style: { display: 'grid', gridTemplateColumns: 'minmax(120px,max-content) 1fr', gap: '5px 12px', alignItems: 'center', padding: '0 8px' } },
          shown.concat([{ id: '__project', name: 'Project (included tabs)', confidence: P.confidence, include: true, _project: true }]).map(t => gcsH(React.Fragment, { key: t.id },
            gcsH("span", { style: { fontSize: 12, fontWeight: t._project ? 700 : 600, opacity: t.include ? 1 : 0.55 } }, t.name),
            gcsH(GcsConfidenceStrip, { mix: t.confidence, width: 160, height: 9, ccy, id: t.id, legend: 'full' }))))),
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
          gcsH("tr", null, gcsH("td", { style: { padding: '3px 8px', fontSize: 12 } },
            gcsH("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, 'Project discount',
              gcsH(NumInput, { className: "pcw-input pcw-mono text-xs", style: { width: 64, textAlign: 'right', padding: '1px 4px' }, value: Number(proj.gcsDiscount) || 0, min: 0, max: 100, isPercent: true, disabled: !!proj.locked || !setLockedProj, "data-gcs-field": "summaryDiscount",
                title: 'Project discount %, taken off each tab price after rounding (same field as in Setup). Tabs with their own % keep it.',
                onChange: v => { if (setLockedProj && Number(v) !== (Number(proj.gcsDiscount) || 0)) setLockedProj(p => ({ ...p, gcsDiscount: Number(v) || 0 })); } }), '%',
              tabs.some(t => t.include && t.lineCount > 0 && t.discountPct !== (Number(proj.gcsDiscount) || 0)) ? gcsH("span", { style: { fontSize: 10.5, color: '#64748b' } }, '(some tabs set their own)') : null)),
            td(P.discount ? '−' + gcsMoney(P.discount, ccy) : '—')),
          P.shippingPrice ? gcsH("tr", null, gcsH("td", { style: { padding: '3px 8px', fontSize: 12 } }, 'Shipping & freight (outbound, rounded; not in EBITDA)'), td(gcsMoney(P.shippingPrice, ccy))) : null,
          gcsH("tr", { style: { borderTop: '2px solid var(--pcw-border, #e2e8f0)' } }, gcsH("td", { style: { padding: '6px 8px', fontSize: 13, fontWeight: 700 } }, 'Total contract value'), td(gcsMoney(P.contractValue, ccy), { bold: true, color: '#b45309' })))))));
};

// ═══ COST SOURCE CELL (Excel "Cost Source Location" picker) ══════════════════════════════════════════════
// Shows the BU the automatic cost came from. Clicking lists every BU with a PO/PQ cost for the part (latest per
// BU, USD); choosing one pulls that BU's latest cost, date, supplier and reference into the line, like changing
// the Cost Source Location in the Excel GCS. Choosing replaces a typed cost too (it is an explicit choice).
var GcsCostSourceCell = function GcsCostSourceCell({ n, bu, locked, updItemMerge, showCostHistory }) {
  var h = React.createElement;
  var [open, setOpen] = useState(null);          // {top,left} when open
  var [opts, setOpts] = useState(null);          // null = loading
  var btnRef = useRef(null), popRef = useRef(null);
  var pv = gcsCostProvenance(n);
  var projBu = String(bu || '').toUpperCase();
  var other = pv && pv.location && projBu && pv.location !== projBu;
  useEffect(() => {
    if (!open) return;
    var close = e => { if (popRef.current && !popRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(null); };
    var esc = e => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  var toggle = async () => {
    if (open) { setOpen(null); return; }
    var r = btnRef.current.getBoundingClientRect();
    setOpen({ top: Math.min(r.bottom + 4, window.innerHeight - 240), left: Math.max(8, Math.min(r.left - 120, window.innerWidth - 400)) });
    setOpts(null);
    try { setOpts(DataService.isConnected() && n.partNumber ? await DataService.getLatestCostByBU(n.partNumber) : []); } catch (e) { setOpts([]); }
  };
  var pick = rec => { var p = gcsCostFillPatch(n, rec, null, { force: true, explicit: true }); if (p) updItemMerge(n.id, p); setOpen(null); };
  var tip = pv ? [`Cost source location: ${pv.location || 'unknown BU'}`, pv.type ? `${pv.type}${pv.doc ? ' ' + pv.doc : ''}` : '', pv.date ? `Dated ${pv.date}` : '', pv.supplier ? `Supplier: ${pv.supplier}` : '', pv.qty ? `Qty on document: ${pv.qty}` : '', 'Costs in the feed are in USD. Click to choose another business unit.'].filter(Boolean).join('\n')
    : (n.partNumber ? 'Typed or no automatic cost. Click to take the latest PO/PQ cost from a business unit.' : 'Enter a part number to choose a cost source');
  var short = { 'Purchase Order': 'PO', 'Purchase Quote': 'PQ' };
  return h("td", { className: "py-1 px-1 text-center", "data-cell": `${n.id}-costLoc` },
    h("button", { type: "button", ref: btnRef, title: tip, "data-cost-loc": pv ? pv.location : '', disabled: !n.partNumber, onClick: toggle,
      style: { display: 'inline-flex', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: n.partNumber ? 'pointer' : 'default', padding: 0 } },
      pv ? h("span", { style: { fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: other ? '#fef3c7' : '#ede9fe', color: other ? '#92400e' : '#5b21b6' } }, pv.location || pv.short || '?') : h("span", { style: { color: '#cbd5e1', fontSize: 10 } }, "—"),
      pv && pv.short && pv.location ? h("span", { style: { fontSize: 9, color: '#64748b', fontWeight: 600 } }, pv.short) : null,
      n.partNumber ? h("span", { style: { fontSize: 8, color: '#94a3b8' } }, "▾") : null),
    open ? ReactDOM.createPortal(h("div", { ref: popRef, "data-cost-picker": n.id, style: { position: 'fixed', top: open.top, left: open.left, width: 390, zIndex: 1200, background: 'var(--pcw-surface, #fff)', border: '1px solid var(--pcw-border, #e2e8f0)', borderRadius: 8, boxShadow: '0 12px 30px rgba(0,0,0,.25)', padding: 8, textAlign: 'left', fontSize: 12 } },
      h("div", { style: { fontWeight: 700, marginBottom: 6 } }, `Cost source location — ${n.partNumber}`),
      opts === null ? h("div", { style: { color: '#64748b', padding: 6 } }, "Looking up…")
        : !DataService.isConnected() ? h("div", { style: { color: '#92400e', padding: 6 } }, "Feed file not connected.")
        : !opts.length ? h("div", { style: { color: '#64748b', padding: 6 } }, "No PO or PQ cost for this part in any business unit.")
        : h("div", { style: { display: 'flex', flexDirection: 'column', gap: 2 } }, opts.map(o => {
          var cur = pv && pv.location === o.bu && pv.doc === o.docNo;
          return h("button", { key: o.bu, type: "button", "data-cost-option": o.bu, disabled: locked, onClick: () => pick(o),
            style: { display: 'grid', gridTemplateColumns: '46px 30px 92px 76px 1fr', gap: 6, alignItems: 'center', padding: '5px 6px', border: 'none', borderRadius: 5, cursor: locked ? 'default' : 'pointer', textAlign: 'left', background: cur ? '#ede9fe' : 'transparent', fontSize: 11.5 } },
            h("b", { style: { color: o.bu === projBu ? '#5b21b6' : '#92400e' } }, o.bu || '?'),
            h("span", { style: { color: '#64748b' } }, short[o.status] || o.status),
            h("span", { className: "pcw-mono", style: { textAlign: 'right', fontWeight: 600 } }, fc(o.unitCost) + ' USD'),
            h("span", { className: "pcw-mono", style: { color: '#64748b' } }, o.date),
            h("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569' }, title: `${o.docNo} · ${o.supplier}` }, o.supplier || o.docNo));
        })),
      h("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, borderTop: '1px solid var(--pcw-border, #e2e8f0)', paddingTop: 6 } },
        h("span", { style: { fontSize: 10.5, color: '#64748b' } }, "Latest cost per business unit, in USD."),
        h("button", { type: "button", className: "pcw-btn pcw-btn-secondary", style: { fontSize: 11, padding: '2px 8px' }, onClick: () => { setOpen(null); showCostHistory(n.id, n.partNumber, true); } }, "Full cost history"))),
      document.body) : null);
};

// ═══ COLLAPSIBLE CARD ═════════════════════════════════════════════════════════════════════════════════════
// Card with a clickable title that hides its body; collapsed by default unless defaultOpen.
// Used for Summary sections that are reference detail rather than headline (e.g. Selected Suppliers).
var GcsCollapsibleCard = function GcsCollapsibleCard({ title, summary, defaultOpen, id, children }) {
  var h = React.createElement;
  var [open, setOpen] = useState(!!defaultOpen);
  return h("div", { className: "pcw-card", "data-collapsible": id, style: { padding: open ? undefined : '10px 16px' } },
    h("button", { type: "button", onClick: () => setOpen(o => !o), "aria-expanded": open, "data-collapsible-toggle": id,
      style: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', marginBottom: open ? 10 : 0 } },
      h("span", { style: { fontSize: 11, color: '#94a3b8', width: 10 } }, open ? '▾' : '▸'),
      h("span", { style: { fontWeight: 700, fontSize: 13, color: 'var(--pcw-text-primary)' } }, title),
      !open && summary ? h("span", { style: { fontSize: 11.5, color: '#64748b', marginLeft: 'auto' } }, summary) : null),
    open ? children : null);
};
