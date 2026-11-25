// ═══ SETUP TAB (GCS v0.25) ═══════════════════════════════════════════════════
// Essentials first: a checklist of what is still missing, a section list on the left, one card per subject,
// and the rarely changed fields behind "More…" / "Change". Preferences moved to the header ⋯ menu, Save &
// restore to the header Save menu, and the approval log to the Summary tab.
// SetupTab is called as a plain function by the worksheet, so it must not use hooks itself: it renders GcsSetupView.
var suH = React.createElement;
var SU_INSIDE_SALES = ["Ryan Chisholm", "Liz Yang", "Katie Doonan", "Connor Teall", "Kristina Larson", "Duana Olson", "Madeline Carlson", "Taryn Rodenborg", "Rebecca Herzog", "My Moua", "Flavia Caceja"];
var SU_OUTSIDE_SALES = ["Juan Ruiz", "Marcos Albuquerque", "Christian Shannon", "Zeyad Sabbah", "Rahman Sharaf", "Deepak Subramanian", "Erric Tham", "Tetiana Gurniak", "Martin Italiani", "Antoine El Hallal", "Raymond Dib", "Trevor Courtney", "Blaine Hartkopf", "Oliver Burns", "Haskell Cooke", "Shaun Verbout"];

var suField = (label, tip, input, o = {}) => suH("div", { style: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...(o.style || {}) } },
  suH("label", { className: "pcw-label", style: { margin: 0 } }, tip ? suH(Tooltip, { text: tip }, label) : label), input);
var suGrid = (cols, ...kids) => suH("div", { style: { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '12px 14px' } }, ...kids);
var suCard = (id, title, right, ...kids) => suH("section", { id: 'setup-' + id, "data-setup": id, className: "pcw-card", style: { display: 'flex', flexDirection: 'column', gap: 14, scrollMarginTop: 80 } },
  suH("div", { style: { display: 'flex', alignItems: 'center', gap: 10 } }, suH("h3", { className: "pcw-h3", style: { margin: 0, border: 0, padding: 0 } }, title), right ? suH("div", { style: { marginLeft: 'auto' } }, right) : null), ...kids);
var suMoreLink = (open, setOpen, label, id) => suH("button", { type: 'button', "data-setup-more": id, onClick: () => setOpen(o => !o),
  style: { alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, fontSize: 12.5, color: '#2563eb', cursor: 'pointer' } }, (open ? '− ' : '+ ') + label);
var suSeg = (opts, value, onPick, disabled, id) => suH("div", { role: 'group', "data-setup-seg": id, style: { display: 'flex', border: '1px solid var(--pcw-border, #cbd5e1)', borderRadius: 6, overflow: 'hidden', height: 34 } },
  opts.map((o, i) => suH("button", { key: o, type: 'button', disabled, "aria-pressed": value === o, onClick: () => onPick(o),
    style: { flex: 1, border: 0, borderLeft: i ? '1px solid var(--pcw-border, #e2e8f0)' : 0, background: value === o ? '#2563eb' : 'var(--pcw-surface, #fff)', color: value === o ? '#fff' : 'var(--pcw-text-primary, #1e293b)', fontSize: 12, fontWeight: value === o ? 700 : 500, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .6 : 1, fontFamily: 'inherit' } }, o)));
var suDot = c => suH("span", { style: { width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block' } });

// Customer: one field that searches the BP list as you type, with "use as typed" for a customer not in it.
var GcsCustomerPicker = ({ proj, setProj, projBu }) => {
  var locked = !!proj.locked;
  var [q, setQ] = useState(proj.customer.name || '');
  var [open, setOpen] = useState(false);
  var [results, setResults] = useState([]);
  var [busy, setBusy] = useState(false);
  var ref = useRef(null);
  useEffect(() => { setQ(proj.customer.name || ''); }, [proj.customer.name]);
  useEffect(() => { if (!open) return; var f = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, [open]);
  useEffect(() => {
    if (!open || !q.trim() || !DataService.isConnected()) { setResults([]); setBusy(false); return; }
    var live = true; setBusy(true);
    var tm = setTimeout(async () => { try { var r = await DataService.searchCustomers(q, projBu); if (live) setResults((r || []).slice(0, 30)); } catch (e) { if (live) setResults([]); } if (live) setBusy(false); }, 220);
    return () => { live = false; clearTimeout(tm); };
  }, [q, open, projBu]);
  var apply = patchFn => setProj(p => applyCustomerMitigation(p, patchFn(p)));
  var pick = c => {
    if (locked) return;
    var base = p => ({ ...p, customer: { ...p.customer, name: c.name, code: c.code || '', ref: c.ref || p.customer.ref, country: c.country || p.customer.country, manual: false } });
    if (c.code) DataService.lookupCustomerBP(c.code).then(bp => apply(p => { var n = base(p); if (bp) { if (bp.country) n.customer.country = bp.country; if (bp.paymentTerms) n.paymentTerms = bp.paymentTerms; if (bp.currency) n.sellCcy = bp.currency; if (bp.salesPerson && bp.salesPerson !== '-No Sales Employee-' && !p.insideSales) n.insideSales = bp.salesPerson; } return n; })).catch(() => apply(base));
    else apply(base);
    setQ(c.name); setOpen(false); setResults([]);
  };
  var useTyped = () => { if (locked || !q.trim()) return; apply(p => ({ ...p, customer: { ...p.customer, name: q.trim(), code: p.customer.manual ? p.customer.code : '', manual: true } })); setOpen(false); };
  var connected = DataService.isConnected();
  var cust = proj.customer || {};
  var status = !cust.name ? null : cust.manual ? suH("span", { "data-cust-status": "manual", style: { color: '#b45309' } }, 'Typed in — not from the BP list')
    : cust.code ? suH("span", { "data-cust-status": "bp", style: { color: '#15803d' } }, `From the BP list · ${cust.code}`) : suH("span", { style: { color: '#64748b' } }, 'No customer code');
  var showList = open && !locked && q.trim() && q.trim() !== (cust.name || '');
  return suH("div", { ref, style: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 } },
    suH("label", { className: "pcw-label", style: { margin: 0 } }, suH(Tooltip, { text: 'Type to search the BP list in the feed (your business unit first). Not in the list? Choose "Use as typed".' }, 'Customer')),
    suH("input", { className: "pcw-input", "data-setup": "customer-input", value: q, readOnly: locked, placeholder: connected ? 'Search the BP list or type a name' : 'Customer name (connect the feed to search the BP list)',
      onChange: e => { setQ(e.target.value); setOpen(true); }, onFocus: () => setOpen(true),
      onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); if (results.length) pick(results[0]); else useTyped(); } if (e.key === 'Escape') setOpen(false); } }),
    suH("div", { style: { fontSize: 11.5, minHeight: 16 } }, status),
    showList ? suH("div", { "data-setup": "customer-results", style: { position: 'absolute', top: 58, left: 0, right: 0, zIndex: 50, background: 'var(--pcw-surface, #fff)', border: '1px solid var(--pcw-border, #e2e8f0)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.14)', maxHeight: 320, overflowY: 'auto', padding: 4 } },
      busy ? suH("div", { style: { fontSize: 12, color: '#64748b', padding: '6px 10px' } }, 'Searching…') : null,
      results.map((c, i) => suH(React.Fragment, { key: c.id || i },
        c.crossBu && (i === 0 || !results[i - 1].crossBu) ? suH("div", { style: { fontSize: 10, fontWeight: 700, color: '#94a3b8', padding: '6px 10px 2px', textTransform: 'uppercase', letterSpacing: '.05em' } }, 'Other business units') : null,
        suH("button", { type: 'button', "data-cust-result": c.code || c.name, onClick: () => pick(c), style: { display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', background: 'none', border: 'none', borderRadius: 5, cursor: 'pointer', opacity: c.crossBu ? .75 : 1 },
          onMouseEnter: e => e.currentTarget.style.background = 'var(--pcw-surface-2, #f1f5f9)', onMouseLeave: e => e.currentTarget.style.background = 'none' },
          suH("div", { style: { fontSize: 12.5, fontWeight: 600 } }, c.name), suH("div", { style: { fontSize: 11, color: '#64748b' } }, [c.code, c.crossBu ? c.type + ' (other BU)' : c.type, c.country].filter(Boolean).join(' · '))))),
      !busy && connected && !results.length ? suH("div", { style: { fontSize: 12, color: '#64748b', padding: '6px 10px' } }, 'No match in the BP list.') : null,
      suH("button", { type: 'button', "data-setup": "customer-use-typed", onClick: useTyped, style: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginTop: 2, borderTop: '1px solid var(--pcw-border, #e2e8f0)', background: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', cursor: 'pointer', fontSize: 12.5, color: '#2563eb' } },
        `Use “${q.trim()}” as typed`, suH("span", { style: { color: '#94a3b8', marginLeft: 6 } }, 'not in the BP list'))) : null);
};

var GcsSetupView = (P) => {
  var { proj, setProj, setLockedProj, sched, setSched, isCIT, t } = P;
  var locked = !!proj.locked;
  var [moreProject, setMoreProject] = useState(false);
  var [editDefaults, setEditDefaults] = useState(false);
  var [editRates, setEditRates] = useState(false);
  var [moreDisc, setMoreDisc] = useState(false);
  var [feedDetails, setFeedDetails] = useState(false);
  var [linksOpen, setLinksOpen] = useState(false);
  var set = (k, v) => setLockedProj(p => ({ ...p, [k]: v }));
  var num = (k, v) => set(k, v === '' || v === null ? null : Number(v));
  var numBox = (k, dflt, opts = {}) => suH(NumInput, { className: "pcw-input pcw-mono", style: { width: '100%', textAlign: 'right' }, value: proj[k] ?? dflt, min: 0, disabled: locked, ...opts,
    onChange: v => { if (!locked && Number(v) !== Number(proj[k] ?? dflt)) num(k, v); } });
  var go = id => { var el = document.getElementById('setup-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  // ── checklist ──
  var feedOn = P.fsConnected && !P.fsStale;
  var essentials = [
    { id: 'project', label: 'Project name', done: !!(proj.name || '').trim() },
    { id: 'project', label: 'Quote reference', done: !!(proj.ref || '').trim() },
    { id: 'customer', label: 'Customer', done: !!(proj.customer && (proj.customer.name || '').trim()) },
    { id: 'method', label: 'Bid location', done: !!proj.bidLocation },
    { id: 'method', label: 'Segment', note: 'sets the EBITDA target', done: !!proj.segment },
    { id: 'connections', label: 'Feed', miss: 'Feed not connected', note: 'costs, BP list, rates', done: feedOn },
  ];
  var missing = essentials.filter(e => !e.done);
  var secDone = id => essentials.filter(e => e.id === id).every(e => e.done);
  var nav = [['project', 'Project'], ['customer', 'Customer'], ['method', 'Costing method'], ['currency', 'Currency'], ['discounts', 'Discounts & commissions'], ['connections', 'Feed & files']];
  var navDot = id => (['currency', 'discounts'].includes(id) || secDone(id)) ? suH("span", { style: { color: '#16a34a', width: 12 } }, '✓') : suH("span", { style: { color: '#d97706', width: 12 } }, '●');

  // ── project ──
  var moreFilled = [proj.paymentTerms, proj.freightPaymentTerm, proj.revisionDate, (proj.notes || '').trim()].filter(Boolean).length;
  var projectCard = suCard('project', t('projectInfo'), null,
    suGrid(2,
      suField(t('projectName'), 'Used in all exports and the package file name', suH(I, { value: proj.name, onChange: e => set('name', e.target.value), placeholder: 'e.g. Riceland Expansion' })),
      suGrid(2,
        suField(t('quoteRef'), 'Your quote or project reference, used in file names and exports', suH(I, { value: proj.ref, onChange: e => set('ref', e.target.value), placeholder: 'Q-2026-001' })),
        suField(t('revision'), 'Increase each time the quote is formally revised and re-issued', suH(I, { type: 'number', min: '0', step: '1', value: proj.rev, onChange: e => set('rev', e.target.value.replace(/\D/g, '')), placeholder: '0' }))),
      suField(t('businessUnit'), 'Which company division is quoting', suH("div", null, suSeg(BUS, proj.bu, b => { if (!locked) setProj(p => ({ ...p, bu: b })); }, locked, 'bu'),
        isCIT ? suH("div", { className: "pcw-cit-notice", style: { marginTop: 6 } }, "🇧🇷 CIT — Brazilian Import Tax tab active") : null)),
      suGrid(2,
        suField('Incoterm', "Seller's responsibility for delivery", suH(Sel, { value: proj.incoterm || 'EXW', onChange: e => set('incoterm', e.target.value) }, INCOTERMS.map(i => suH("option", { key: i }, i)))),
        suField('RFQ date', 'Date the customer sent the RFQ', suH(I, { type: 'date', value: proj.rfqDate || '', onChange: e => set('rfqDate', e.target.value) })))),
    suMoreLink(moreProject, setMoreProject, moreProject ? 'Fewer details' : `Payment terms, freight term, revision date, notes${moreFilled ? ` (${moreFilled} filled)` : ''}`, 'project'),
    moreProject ? suGrid(2,
      suField('Payment terms', 'e.g. Net 30, 50% deposit with order / 50% on delivery', suH(I, { value: proj.paymentTerms || '', onChange: e => set('paymentTerms', e.target.value), placeholder: 'e.g. Net 30, 50% deposit' })),
      suField('Freight payment term', 'Collect: buyer pays the carrier. Paid: seller pays, no surcharge. Prepaid: seller pays in advance for the buyer. Prepaid & Add: seller prepays then invoices it.',
        suH(Sel, { value: proj.freightPaymentTerm || '', onChange: e => set('freightPaymentTerm', e.target.value) }, suH("option", { value: '' }, '— select —'), ["Collect", "Paid", "Prepaid", "Prepaid & Add"].map(o => suH("option", { key: o }, o)))),
      suField('Revision date', 'Date this revision was created or last updated', suH(I, { type: 'date', value: proj.revisionDate || '', onChange: e => set('revisionDate', e.target.value) })),
      suField('Notes', 'Internal only — not in the customer PDF', suH("textarea", { className: "pcw-input resize-none", rows: 2, value: proj.notes || '', onChange: e => set('notes', e.target.value), placeholder: 'Internal notes…', readOnly: locked }))) : null);

  // ── customer ──
  var salesInput = (k, listId, names, label) => suField(label, label === 'Inside sales' ? 'Inside Sales employee managing this quote' : 'Field sales employee who owns the customer relationship',
    suH(React.Fragment, null, suH("input", { className: "pcw-input w-full", list: listId, value: proj[k] || '', readOnly: locked, placeholder: 'Name', onChange: e => set(k, e.target.value) }),
      suH("datalist", { id: listId }, names.map(n => suH("option", { key: n, value: n })))));
  var customerCard = suCard('customer', 'Customer', null,
    suGrid(2,
      suH(GcsCustomerPicker, { proj, setProj, projBu: proj.bu }),
      suGrid(2,
        suField(t('customerCode'), 'SAP Business One account code (usually starts with C). Filled from the BP list; type one for a manual customer.', suH(I, { value: proj.customer.code || '', onChange: e => setLockedProj(p => ({ ...p, customer: { ...p.customer, code: e.target.value } })), placeholder: 'Code' })),
        suField(t('country'), 'Customer country (ICMS rates, export documents)', suH(I, { value: proj.customer.country || '', onChange: e => setLockedProj(p => ({ ...p, customer: { ...p.customer, country: e.target.value } })), placeholder: 'Country' }))),
      salesInput('insideSales', 'pcw-inside-sales-list', SU_INSIDE_SALES, 'Inside sales'),
      salesInput('outsideSales', 'pcw-outside-sales-list', SU_OUTSIDE_SALES, 'Outside sales')));

  // ── costing method ──
  var loc = GCS_BID_LOCATIONS.find(b => b.name === proj.bidLocation);
  var dflt = [
    ['M&E', fp(Number(proj.mAndE ?? 10))], ['S&A', fp(Number(proj.sAndAExpense ?? 10))],
    ['Inflation', fp(Number(proj.inflationPerMonth ?? GCS_DEFAULT_INFLATION_PER_MONTH)) + ' / month'], ['Round tabs up to', fc(Number(proj.roundTo ?? GCS_DEFAULT_ROUND_TO), 0)],
    ['Scaling exponent', String(proj.scalingExponent ?? GCS_DEFAULT_SCALING_EXPONENT)], ...(Number(proj.plantFeed) > 0 ? [['Plant feed', String(proj.plantFeed)]] : [])];
  var methodCard = suCard('method', 'Costing method', null,
    suGrid(3,
      suField('Bid location', 'Sets M&E and S&A from the Excel Engine table (you can still change both).',
        suH("select", { className: "pcw-input", "data-setup": "bid-location", value: proj.bidLocation || '', disabled: locked, style: !proj.bidLocation ? { borderColor: '#f59e0b' } : undefined,
          onChange: e => { var b = GCS_BID_LOCATIONS.find(x => x.name === e.target.value); setLockedProj(p => ({ ...p, bidLocation: e.target.value, ...(b ? { mAndE: b.mAndE, sAndAExpense: b.sAndA } : {}) })); } },
          suH("option", { value: '' }, 'Select office…'), GCS_BID_LOCATIONS.map(b => suH("option", { key: b.name, value: b.name }, b.name)))),
      suField('Segment', 'Project segment for the EBITDA target. Tabs can override it.',
        suH("select", { className: "pcw-input", "data-setup": "segment", value: proj.segment || '', disabled: locked, style: !proj.segment ? { borderColor: '#f59e0b' } : undefined, onChange: e => set('segment', e.target.value) },
          suH("option", { value: '' }, 'Select segment…'), GCS_SEGMENTS.map(sg => suH("option", { key: sg.name, value: sg.name }, `${sg.name} (${sg.over1m}% >$1m / ${sg.under1m}% <$1m)`)))),
      suField('Costing date', 'Inflation runs up to this date. Blank = today, so an unlocked estimate keeps inflating; set a date to freeze it.',
        suH("div", { style: { display: 'flex', gap: 6, alignItems: 'center' } }, suH("input", { type: 'date', className: "pcw-input", value: proj.costingDate || '', disabled: locked, onChange: e => set('costingDate', e.target.value || '') }),
          !proj.costingDate ? suH("span", { style: { fontSize: 11, color: '#b45309' } }, 'today') : null))),
    suH("div", { "data-setup": "defaults", style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '9px 12px', background: 'var(--pcw-surface-2, #f8fafc)', borderRadius: 8, fontSize: 12.5, color: '#475569' } },
      suH("b", { style: { color: 'var(--pcw-text-primary, #1e293b)' } }, (proj.bidLocation ? proj.bidLocation : 'Standard') + ' defaults'),
      dflt.map(([k, v]) => suH("span", { key: k }, k, ' ', suH("b", { className: "pcw-mono", style: { fontWeight: 600 } }, v))),
      loc && Number(proj.mAndE ?? 10) !== loc.mAndE ? suH("span", { style: { color: '#b45309' } }, `(location standard M&E ${loc.mAndE}%)`) : null,
      suH("button", { type: 'button', className: "pcw-btn-secondary text-xs", "data-setup-more": "defaults", onClick: () => setEditDefaults(o => !o), style: { marginLeft: 'auto' } }, editDefaults ? 'Done' : 'Change')),
    editDefaults ? suGrid(3,
      suField('M&E % of sales', 'Manufacturing & Engineering, % of sales. Deducted before gross margin.', numBox('mAndE', 10, { max: 100, isPercent: true })),
      suField('S&A % of sales', 'Sales & Administration, % of sales. Deducted from gross margin to give EBITDA.', numBox('sAndAExpense', 10, { max: 100, isPercent: true })),
      suField('Inflation % per month', 'Automatic inflation = whole months from the cost date to the costing date × this rate (Excel: 0.5%).', numBox('inflationPerMonth', GCS_DEFAULT_INFLATION_PER_MONTH)),
      suField('Round tab prices up to', 'Each plant section / option price is rounded UP to this amount (Excel: 1,000).', numBox('roundTo', GCS_DEFAULT_ROUND_TO)),
      suField('Scaling exponent', 'Six-tenths rule by default (0.6). Applies to EQD lines.', numBox('scalingExponent', GCS_DEFAULT_SCALING_EXPONENT)),
      suField('Plant feed / capacity', 'Plant size for the automatic EQD scaling: (plant feed ÷ equipment size)^exponent. Same unit as the line sizes.', numBox('plantFeed', 0))) : null);

  // ── currency ──
  var updR = k => e => setLockedProj(p => ({ ...p, rates: { ...p.rates, [k]: parseFloat(e.target.value) || 1 } }));
  var ratesAge = proj.ratesRefreshedAt ? (() => { var d = Math.floor((Date.now() - new Date(proj.ratesRefreshedAt).getTime()) / 86400000); return new Date(proj.ratesRefreshedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + (d > 0 ? ` (${d}d ago)` : ' (today)'); })() : null;
  var linkBtn = (label, onClick, id) => suH("button", { type: 'button', "data-setup": id, style: { background: 'none', border: 'none', padding: 0, color: '#2563eb', cursor: 'pointer', fontSize: 12.5 }, onClick }, label);
  var currencyCard = suCard('currency', 'Currency', null,
    suField(t('sellingCurrency'), 'The currency prices are quoted in. Every cost is converted to it.', suSeg(CURRENCIES, proj.sellCcy, c => { if (!locked && c !== proj.sellCcy) P.setPendingCcyChange(c); }, locked, 'ccy')),
    suH("div", { style: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5, color: '#475569', flexWrap: 'wrap' } },
      ratesAge ? suH("span", null, 'Rates from the feed · ', ratesAge) : suH("span", { style: { color: '#b45309' } }, 'Rates not refreshed from the feed'),
      suH("span", { className: "pcw-mono", style: { color: '#64748b', fontSize: 11.5 } }, CURRENCIES.filter(c => c !== 'USD').map(c => `${c} ${proj.rates[c]}`).join(' · ')),
      suH("span", { style: { marginLeft: 'auto', display: 'flex', gap: 12 } },
        P.fsConnected ? linkBtn('Refresh', () => { LocalFileService.getRates().then(rates => { if (rates) setLockedProj(p => ({ ...p, rates: { ...p.rates, ...rates }, ratesRefreshedAt: new Date().toISOString() })); }); }, 'rates-refresh') : null,
        linkBtn(editRates ? 'Done' : 'Edit rates', () => setEditRates(o => !o), 'rates-edit'))),
    editRates ? suGrid(5, ...CURRENCIES.map(c => suField(`${c} per USD`, null, suH("input", { type: 'number', step: '0.0001', className: "pcw-input text-center pcw-mono", value: proj.rates[c], onChange: updR(c), disabled: locked })))) : null);

  // ── discounts ──
  var discCard = suCard('discounts', 'Discounts & commissions', null,
    suH("div", { "data-gcs": "discounts", style: { display: 'flex', flexDirection: 'column', gap: 14 } }, suGrid(2,
      suField('Project discount %', 'Taken off each tab price after rounding up (Excel Summary). A tab can set its own % in Tab settings.', numBox('gcsDiscount', 0, { max: 100, isPercent: true, "data-gcs-field": "gcsDiscount" })),
      suField('Dealer / agent %', 'Commission built into every sell price: sell ÷ (1 − dealer). 0 if no agent.', numBox('defaultDealer', 0, { max: 100, isPercent: true }))),
    suMoreLink(moreDisc, setMoreDisc, moreDisc ? 'Fewer' : `Discount mitigation (${fp(Number(proj.discountMitigation) || 0)}), default cost source${proj.source ? ` (${proj.source})` : ''}`, 'discounts'),
    moreDisc ? suGrid(2,
      suField('Discount mitigation %', 'A buffer in every sell price so a later customer discount of this % keeps your margin: sell ÷ (1 − mitigation). Separate from the project discount.', numBox('discountMitigation', 0, { max: 100, isPercent: true })),
      suField('Default cost source', 'Source pre-filled on new lines (sets the cost confidence). Autofilled costs set their own source.',
        suH("select", { className: "pcw-input", value: proj.source || '', disabled: locked, onChange: e => set('source', e.target.value) },
          suH("option", { value: '' }, '— select —'), SOURCES.filter(x => x !== '' && (!GCS_HIDDEN_SOURCES.includes(x) || proj.source === x)).map(x => suH("option", { key: x, value: x }, x))))) : null));

  // ── feed & files ──
  var connRow = (id, dot, title, sub, actions, extra) => suH("div", { "data-conn": id, style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderTop: id === 'feed' ? 0 : '1px solid var(--pcw-border, #eef0f2)' } },
    suH("div", { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, suDot(dot), suH("b", { style: { fontSize: 13.5 } }, title), suH("span", { style: { fontSize: 12.5, color: '#64748b' } }, sub),
      suH("div", { style: { marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' } }, ...actions)), extra || null);
  var btn = (label, onClick, o = {}) => suH("button", { key: label, type: 'button', className: o.primary ? "pcw-btn-primary text-xs" : "pcw-btn-secondary text-xs", onClick, disabled: o.disabled, title: o.title, "data-conn-act": o.id, style: o.danger ? { color: '#ef4444' } : undefined }, label);
  var feedAge = P.feedFileModified ? Math.floor((Date.now() - P.feedFileModified) / 86400000) : null;
  var feedSub = P.fsStale ? `${P.fsFileName || 'Feed'} — the browser dropped the file; reconnect it`
    : feedOn ? `${P.fsFileName || ''}${P.feedLastRead ? ' · read ' + P.feedLastRead.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}${feedAge !== null ? ` · file saved ${feedAge === 0 ? 'today' : feedAge + 'd ago'}` : ''}`
    : 'Costs, BP list, EQD and exchange rates come from this Excel file (Chrome / Edge; read locally, nothing uploaded)';
  var health = P.bpHealth;
  var feedDetail = feedDetails && feedOn ? suH("div", { style: { display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, fontSize: 12 } },
    suH("div", { style: { color: health && health.customers > 0 ? '#166534' : '#92400e' } }, health ? (health.customers > 0 ? `BP index: ${health.customers.toLocaleString()} customers · ${health.suppliers.toLocaleString()} suppliers` : 'BP index empty — click Refresh') : 'BP index not built yet — click Refresh'),
    feedAge !== null && feedAge > 7 ? suH("div", { style: { color: feedAge > 30 ? '#dc2626' : '#d97706' } }, `⚠ The feed file was last saved ${feedAge} days ago${feedAge > 30 ? ' — it may be out of date' : ''}`) : null,
    suH("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' } }, suH("span", { style: { color: '#475569', marginRight: 4 } }, 'Column mappings:'),
      [{ key: 'salesQuotes', label: 'Sales Quotes' }, { key: 'salesOrders', label: 'Sales Orders' }, { key: 'purchaseQuotes', label: 'Purchase Quotes' }, { key: 'purchaseOrders', label: 'Purchase Orders' }, { key: 'currency', label: 'Currency Rates' }, { key: 'pricelists', label: 'Pricelists' }, { key: 'ncmCodes', label: 'NCM Codes' }, { key: 'ncmIpiLookup', label: 'NCM IPI Lookup' }, { key: 'taxCodes', label: 'SAP Tax Codes' }]
        .map(({ key, label }) => suH("button", { key, type: 'button', className: "pcw-btn-secondary text-xs", onClick: () => P.fsOpenColMap(key) }, label)),
      suH("button", { type: 'button', className: "pcw-btn-secondary text-xs", style: { color: '#dc2626' }, title: 'Clear saved column overrides and re-detect from the file headers',
        onClick: () => { if (window.confirm('Reset all column mappings?\n\nThis clears manual overrides and re-detects columns from the current file.')) { try { localStorage.removeItem(LS_KEY_COLMAPS); localStorage.removeItem(APP_ID + '-fs-headers'); } catch (e) { } P.fsRefresh(); } } }, 'Reset all')),
    P.fsStatus ? suH("div", { style: { color: P.fsStatus.ok ? '#166534' : '#dc2626' } }, (P.fsStatus.ok ? '✓ ' : '✗ ') + P.fsStatus.msg) : null) : null;
  var connectionsCard = suCard('connections', 'Feed & files', null,
    suH("div", { style: { display: 'flex', flexDirection: 'column' } },
      connRow('feed', P.fsStale ? '#ef4444' : feedOn ? '#22c55e' : '#f59e0b', 'PCW feed', feedSub,
        P.fsStale ? [btn(P.fsConnecting ? 'Reconnecting…' : 'Reconnect', P.fsConnect, { primary: true, disabled: P.fsConnecting, id: 'feed-reconnect' })]
          : feedOn ? [btn(P.fsConnecting ? '…' : 'Refresh', P.fsRefresh, { disabled: P.fsConnecting, id: 'feed-refresh', title: 'Re-read all sheets after updating the file' }), btn(feedDetails ? 'Hide details' : 'Details', () => setFeedDetails(o => !o), { id: 'feed-details' }), btn(t('disconnect'), P.fsDisconnect, { danger: true, id: 'feed-disconnect' })]
            : [btn(P.fsConnecting ? 'Opening…' : 'Connect file', P.fsConnect, { primary: true, disabled: P.fsConnecting, id: 'feed-connect' })], feedDetail),
      connRow('autosave', P.saveFileConnected && !P.saveFileStale ? '#22c55e' : P.saveFileStale ? '#f59e0b' : '#cbd5e1', 'Auto-save file',
        P.saveFileConnected && !P.saveFileStale ? `${P.saveFileName} — saves 2 s after each change` : P.saveFileStale ? `${P.saveFileName} — reconnect after a browser restart` : 'Saves to a .gcs file on your computer 2 s after each change (also in the Save menu)',
        P.saveFileStale ? [btn('Reconnect', () => P.connectSaveFile(false), { primary: true, id: 'autosave-reconnect' }), btn('Clear', () => { if (window.confirm('Clear the auto-save destination?\n\nYour existing .gcs file is not deleted.')) P.disconnectSaveFile(); }, { danger: true })]
          : P.saveFileConnected ? [btn('Stop', P.disconnectSaveFile, { danger: true, id: 'autosave-stop' })] : [btn('Set up', () => P.connectSaveFile(false), { id: 'autosave-setup' })]),
      connRow('links', sched.salesforceLink || sched.sharepointLink ? '#22c55e' : '#cbd5e1', 'Salesforce & SharePoint',
        [sched.salesforceLink ? 'Salesforce linked' : null, sched.sharepointLink ? 'SharePoint linked' : null].filter(Boolean).join(' · ') || 'Opportunity and folder links (needed for quotes over 75,000 USD); import project details',
        [sched.salesforceLink ? suH("a", { key: 'sf', href: sched.salesforceLink, target: '_blank', rel: 'noopener noreferrer', className: "pcw-btn-secondary text-xs" }, 'Open Salesforce') : null,
          sched.sharepointLink ? suH("a", { key: 'sp', href: sched.sharepointLink, target: '_blank', rel: 'noopener noreferrer', className: "pcw-btn-secondary text-xs" }, 'Open SharePoint') : null,
          btn(linksOpen ? 'Done' : (sched.salesforceLink || sched.sharepointLink ? 'Edit' : 'Add links'), () => setLinksOpen(o => !o), { id: 'links-edit' })].filter(Boolean),
        linksOpen ? suH("div", { style: { display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18 } },
          suGrid(2,
            suField(t('salesforceLink'), 'Salesforce opportunity URL, included in the package export', suH(I, { value: sched.salesforceLink || '', type: 'url', placeholder: 'https://your-org.salesforce.com/…', onChange: e => { if (!locked) setSched(p => ({ ...p, salesforceLink: e.target.value })); } })),
            suField(t('sharepointLink'), 'SharePoint folder or document URL, included in the package export', suH(I, { value: sched.sharepointLink || '', type: 'url', placeholder: 'https://your-org.sharepoint.com/…', onChange: e => { if (!locked) setSched(p => ({ ...p, sharepointLink: e.target.value })); } }))),
          !locked ? suH("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            btn(t('importSalesforce'), P.importSalesforceCSV, { title: 'Import customer, project, reference and links from a Salesforce Opportunity or Case CSV report' }),
            btn(t('importSharePoint'), P.importSharePointPaste, { title: 'Paste copied SharePoint folder properties to fill project fields' })) : null) : null)));

  // ── layout ──
  return suH("div", { "data-setup": "view", style: { display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', maxWidth: 1240, margin: '0 auto' } },
    suH("aside", { style: { flex: '1 1 190px', maxWidth: 220, position: 'sticky', top: 76, display: 'flex', flexDirection: 'column', gap: 2 } },
      suH("div", { style: { fontSize: 10.5, fontWeight: 700, color: '#94a3b8', letterSpacing: '.06em', padding: '0 10px 6px' } }, 'SETUP'),
      nav.map(([id, label]) => suH("button", { key: id, type: 'button', "data-setup-nav": id, onClick: () => go(id), style: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none', textAlign: 'left', fontSize: 13, color: 'var(--pcw-text-primary, #1e293b)', cursor: 'pointer' },
        onMouseEnter: e => e.currentTarget.style.background = 'var(--pcw-surface-2, #eef2f7)', onMouseLeave: e => e.currentTarget.style.background = 'none' }, navDot(id), label)),
      suH("div", { style: { marginTop: 18, padding: '10px', fontSize: 11.5, color: '#64748b', lineHeight: 1.55, borderTop: '1px solid var(--pcw-border, #e2e8f0)' } },
        'Preferences are in the ', suH("b", null, '⋯'), ' menu, saving and packages in ', suH("b", null, 'Save'), ', and approvals on ', suH("b", null, 'Summary'), '.')),
    suH("div", { style: { flex: '999 1 600px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 } },
      suH("div", { "data-setup": "checklist", "data-missing": missing.length, className: "pcw-card", style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px 16px', background: missing.length ? '#fffbeb' : '#f0fdf4', borderColor: missing.length ? '#fde68a' : '#bbf7d0' } },
        suH("b", { style: { fontSize: 13.5, color: missing.length ? '#92400e' : '#166534' } }, missing.length ? `${essentials.length - missing.length} of ${essentials.length} essentials done` : 'All essentials done'),
        missing.map(m => suH("button", { key: m.label, type: 'button', "data-missing-item": m.label, onClick: () => go(m.id), style: { fontSize: 12, padding: '3px 10px', borderRadius: 12, border: '1px solid #fde68a', background: '#fff', color: '#92400e', cursor: 'pointer' } }, (m.miss || m.label + ' missing') + (m.note ? ` (${m.note})` : '')))),
      projectCard, customerCard, methodCard,
      suH("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 } }, currencyCard, discCard),
      connectionsCard));
};

var SetupTab = props => suH(GcsSetupView, props);
