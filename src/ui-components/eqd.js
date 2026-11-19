
// ═══ EQD (Equipment Quotations Database) — line cell and search panel ═══════════════════════════════════════
// Excel GCS: columns F (equipment) G (material) K (size) L (vendor) drive an exact lookup of the latest quote.
// Here: the EQD cell opens a picker with the same four choices (each narrowed by the ones before) and the list of
// matching quotes, newest first; choosing a quote puts the line in EQD mode (engine/gcs.js gcsEqdPatch).
// The EQD Search panel adds new lines from quotes into a chosen tab and position. Data: DataService.getEqd().

var eqdH = React.createElement;
var eqdCache = { promise: null, at: 0 };
var eqdLoad = (force) => {
  if (!DataService.isConnected()) return Promise.resolve(null);
  if (!eqdCache.promise || force) eqdCache.promise = DataService.getEqd().catch(() => null);
  return eqdCache.promise;
};
var eqdMoney = (v, ccy) => fc(v) + ' ' + (ccy || 'USD');
var eqdLink = (url, label, title) => url ? eqdH("a", { href: url, target: "_blank", rel: "noopener noreferrer", title: title || url, onClick: e => e.stopPropagation(), style: { color: '#2563eb', textDecoration: 'none', fontSize: 11 } }, label) : null;
var eqdNoData = db => eqdH("div", { style: { color: '#92400e', padding: 6, fontSize: 12 } },
  !DataService.isConnected() ? 'Feed file not connected.' : db === null ? 'The feed file has no EQD sheet. Add the "Equipment Quotations Database - Crown Sales" query to the PCW feed as a sheet named EQD.' : 'No Liquids quotes in the EQD sheet.');
var eqdSel = (label, value, options, onChange, fmt, key) => eqdH("label", { style: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', minWidth: 0 } }, label,
  eqdH("select", { className: "pcw-input text-xs", value: value === undefined || value === null ? '' : String(value), "data-eqd-filter": key, onChange: e => onChange(e.target.value), disabled: !options.length && !value },
    eqdH("option", { value: '' }, options.length ? 'Any' : '—'), options.map(o => eqdH("option", { key: String(o), value: String(o) }, fmt ? fmt(o) : String(o)))));
var eqdQuoteRow = (r, rates, onPick, current, locked) => {
  var pr = gcsEqdPrice(r, rates);
  return eqdH("tr", { key: String(r.id) + r.date + r.price, "data-eqd-quote": r.id, onClick: () => { if (pr && !locked) onPick(r); }, style: { cursor: pr && !locked ? 'pointer' : 'not-allowed', background: current ? '#ede9fe' : undefined, opacity: pr ? 1 : 0.55 },
      title: pr ? (pr.converted ? `Converted to USD at ${pr.converted.rate} ${pr.converted.from} per USD` : 'Use this quote') : `No exchange rate for ${r.ccy}: add it in Setup (rates per 1 USD)` },
    ["date", "equipment", "material", "size", "vendor"].map(k => eqdH("td", { key: k, className: k === 'date' ? 'pcw-mono' : undefined, style: { padding: '3px 6px', whiteSpace: 'nowrap', fontSize: 11.5 } }, k === 'size' ? gcsEqdSizeLabel(r) : r[k])),
    eqdH("td", { className: "pcw-mono", style: { padding: '3px 6px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 11.5 } }, eqdMoney(r.price, r.ccy)),
    eqdH("td", { style: { padding: '3px 6px', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: r.description }, [r.sap, r.drawing].filter(Boolean).join(' · ')),
    eqdH("td", { style: { padding: '3px 6px', whiteSpace: 'nowrap' } }, eqdLink(r.vendorUrl, 'quote', 'Vendor quote document'), r.vendorUrl && r.drawingUrl ? ' ' : null, eqdLink(r.drawingUrl, 'drawing', 'Reference drawing')));
};
var eqdQuoteTable = (rows, rates, onPick, currentId, locked, limit) => eqdH("table", { style: { width: '100%', borderCollapse: 'collapse' } },
  eqdH("thead", null, eqdH("tr", null, ['Quote date', 'Equipment', 'Material', 'Size', 'Vendor', 'Price', 'SAP · model / drawing', 'Links'].map(t => eqdH("th", { key: t, style: { padding: '3px 6px', textAlign: t === 'Price' ? 'right' : 'left', fontSize: 9.5, color: '#64748b', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--pcw-surface, #fff)' } }, t)))),
  eqdH("tbody", null, rows.slice(0, limit || 200).map(r => eqdQuoteRow(r, rates, onPick, currentId !== null && currentId !== undefined && String(r.id) === String(currentId), locked))));

// ── Line cell ──
var GcsEqdCell = function GcsEqdCell({ n, locked, rates, updItemMerge }) {
  var [open, setOpen] = useState(null), [db, setDb] = useState(undefined);
  var [sel, setSel] = useState({});
  var btnRef = useRef(null), popRef = useRef(null);
  var e = n.eqd && n.eqd.equipment ? n.eqd : null;
  useEffect(() => {
    if (!open) return;
    var close = ev => { if (popRef.current && !popRef.current.contains(ev.target) && btnRef.current && !btnRef.current.contains(ev.target)) setOpen(null); };
    var esc = ev => { if (ev.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  var toggle = async () => {
    if (open) { setOpen(null); return; }
    var r = btnRef.current.getBoundingClientRect();
    setOpen({ top: Math.min(r.bottom + 4, window.innerHeight - 420), left: Math.max(8, Math.min(r.left, window.innerWidth - 920)) });
    setSel(e ? { equipment: e.equipment, material: e.material, size: e.size, vendor: e.vendor } : {});
    setDb(undefined); setDb(await eqdLoad());
  };
  var records = db && db.records || [];
  var opts = gcsEqdOptions(records, sel);
  var matches = db ? gcsEqdQuery(records, sel) : [];
  var setF = (k, v) => setSel(s => { var o = { ...s, [k]: v }; var order = ['equipment', 'material', 'size', 'vendor']; order.slice(order.indexOf(k) + 1).forEach(x => { delete o[x]; }); return o; });
  var pick = rec => { var p = gcsEqdPatch(n, rec, rates); if (p) { updItemMerge(n.id, p); setOpen(null); } };
  var clear = () => { updItemMerge(n.id, gcsEqdClearPatch(n)); setOpen(null); };
  var label = e ? [e.equipment, e.material, gcsEqdSizeLabel(e), e.vendor].filter(x => x !== '' && x !== undefined && x !== null).join(' · ') : '';
  return eqdH("td", { className: "py-1 px-1", "data-cell": `${n.id}-eqd` }, eqdH("div", { style: { display: 'flex', alignItems: 'center', gap: 4 } },
    eqdH("button", { type: "button", ref: btnRef, onClick: toggle, disabled: locked && !e, "data-eqd-open": n.id,
      title: e ? `EQD: ${label}${e.quoteNo ? '\nQuote ' + e.quoteNo : ''}\nClick to change or clear` : 'Cost this line from the Equipment Quotations Database (EQD)',
      style: { display: 'flex', alignItems: 'center', gap: 4, width: '100%', maxWidth: 'var(--col-eqd)', border: e ? '1px solid #c4b5fd' : '1px dashed var(--pcw-border, #cbd5e1)', background: e ? '#f5f3ff' : 'transparent', borderRadius: 4, padding: '1px 5px', cursor: 'pointer', fontSize: 10.5, color: e ? '#5b21b6' : '#94a3b8', textAlign: 'left' } },
      eqdH("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, e ? label : 'EQD…'), eqdH("span", { style: { fontSize: 8 } }, "▾")),
    e && e.vendorUrl ? eqdLink(e.vendorUrl, '📄', 'Open the vendor quote' + (e.quoteNo ? ' ' + e.quoteNo : '')) : null,
    e && e.drawingUrl ? eqdLink(e.drawingUrl, '📐', 'Open the reference drawing') : null),
    open ? ReactDOM.createPortal(eqdH("div", { ref: popRef, "data-eqd-picker": n.id, style: { position: 'fixed', top: open.top, left: open.left, width: Math.min(910, window.innerWidth - 16), maxHeight: 410, display: 'flex', flexDirection: 'column', zIndex: 1200, background: 'var(--pcw-surface, #fff)', border: '1px solid var(--pcw-border, #e2e8f0)', borderRadius: 8, boxShadow: '0 12px 30px rgba(0,0,0,.25)', padding: 10, fontSize: 12 } },
      eqdH("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } }, eqdH("b", null, "Equipment Quotations Database (Liquids)"),
        db ? eqdH("span", { style: { color: '#64748b', fontSize: 11 } }, `${records.length.toLocaleString()} quotes`) : null,
        e && !locked ? eqdH("button", { type: "button", className: "pcw-btn pcw-btn-secondary", style: { marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }, onClick: clear, "data-eqd-clear": n.id, title: 'Leave EQD mode and restore what the line held before' }, "Clear EQD") : null),
      db === undefined ? eqdH("div", { style: { color: '#64748b', padding: 6 } }, "Loading…") : !records.length ? eqdNoData(db) : eqdH(React.Fragment, null,
        eqdH("div", { style: { display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 1.2fr', gap: 8, marginBottom: 8 } },
          eqdSel('Equipment', sel.equipment, opts.equipment, v => setF('equipment', v), null, 'equipment'),
          eqdSel('Material', sel.material, opts.material, v => setF('material', v), null, 'material'),
          eqdSel('Size', sel.size, opts.size, v => setF('size', v === '' ? '' : (isNaN(Number(v)) ? v : Number(v))), null, 'size'),
          eqdSel('Vendor', sel.vendor, opts.vendor, v => setF('vendor', v), null, 'vendor')),
        eqdH("div", { style: { fontSize: 11, color: '#475569', marginBottom: 4 } }, sel.equipment ? `${matches.length} matching quote${matches.length === 1 ? '' : 's'}, newest first. Click one to use it${sel.vendor ? '' : ' (choose all four to match Excel exactly)'}.` : 'Choose the equipment, then narrow by material, size and vendor.'),
        sel.equipment ? eqdH("div", { style: { overflow: 'auto', flex: 1, border: '1px solid var(--pcw-border, #e2e8f0)', borderRadius: 6 } }, eqdQuoteTable(matches, rates, pick, e && e.id, locked, 200)) : null)),
      document.body) : null);
};

// ── Search panel: add lines from quotes ──
var EqdSearchPanel = function EqdSearchPanel({ onClose, costingSheets, activeSheetId, items, defaultAfterId, onImport, locked, rates }) {
  var [db, setDb] = useState(undefined), [sel, setSel] = useState({}), [basket, setBasket] = useState([]);
  var [destSheet, setDestSheet] = useState(activeSheetId || (costingSheets[0] || {}).id), [afterId, setAfterId] = useState(defaultAfterId || ''), [result, setResult] = useState(null);
  useEffect(() => { eqdLoad().then(setDb); }, []);
  var records = db && db.records || [];
  var opts = gcsEqdOptions(records, sel);
  var matches = useMemo(() => (db ? gcsEqdQuery(records, sel) : []), [db, sel]);
  var setF = (k, v) => setSel(s => { var o = { ...s, [k]: v }; var order = ['equipment', 'material', 'size', 'vendor']; if (order.includes(k)) order.slice(order.indexOf(k) + 1).forEach(x => { delete o[x]; }); return o; });
  var keyOf = r => [r.id, r.date, r.price].join('|');
  var toggle = r => setBasket(b => (b.some(x => keyOf(x) === keyOf(r)) ? b.filter(x => keyOf(x) !== keyOf(r)) : [...b, r]));
  var sheetRoots = (items || []).filter(i => (i.sheetId || (costingSheets[0] || {}).id) === destSheet && !i.parentId);
  var doImport = () => { if (!basket.length || locked) return; var s = onImport({ quotes: basket, sheetId: destSheet, afterId: afterId || null }); setResult(s); setBasket([]); };
  return eqdH("div", { style: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 1000, display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: 18 }, onMouseDown: ev => { if (ev.target === ev.currentTarget) onClose(); } },
    eqdH("div", { "data-eqd": "panel", style: { background: 'var(--pcw-surface, #fff)', borderRadius: 10, width: '100%', maxWidth: 1500, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.3)' } },
      eqdH("div", { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--pcw-border, #e2e8f0)' } },
        eqdH("div", { style: { fontWeight: 800, fontSize: 15 } }, "EQD Search"), eqdH("span", { style: { fontSize: 11.5, color: '#475569' } }, db ? `${records.length.toLocaleString()} Liquids quotes from the feed's EQD sheet` : ''),
        eqdH("button", { className: "pcw-btn pcw-btn-secondary", style: { marginLeft: 'auto', fontSize: 11.5, padding: '4px 10px' }, onClick: onClose, "data-eqd": "close" }, "Close")),
      eqdH("div", { style: { display: 'flex', flex: 1, minHeight: 0 } },
        eqdH("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, padding: '10px 14px', gap: 8 } },
          db === undefined ? eqdH("div", { style: { color: '#64748b' } }, "Loading…") : !records.length ? eqdNoData(db) : eqdH(React.Fragment, null,
            eqdH("div", { style: { display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 1.2fr 1.6fr', gap: 8 } },
              eqdSel('Equipment', sel.equipment, opts.equipment, v => setF('equipment', v), null, 'equipment'),
              eqdSel('Material', sel.material, opts.material, v => setF('material', v), null, 'material'),
              eqdSel('Size', sel.size, opts.size, v => setF('size', v === '' ? '' : (isNaN(Number(v)) ? v : Number(v))), null, 'size'),
              eqdSel('Vendor', sel.vendor, opts.vendor, v => setF('vendor', v), null, 'vendor'),
              eqdH("label", { style: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' } }, 'Text',
                eqdH("input", { className: "pcw-input text-xs", placeholder: 'SAP, model, description, quote no.…', value: sel.text || '', onChange: ev => setF('text', ev.target.value), "data-eqd-filter": "text" }))),
            eqdH("div", { style: { fontSize: 12 } }, eqdH("b", { "data-eqd": "count" }, `${matches.length.toLocaleString()} quotes`), matches.length > 300 ? ' (showing the newest 300; narrow the filters)' : '', ' · click quotes to add them to the basket'),
            eqdH("div", { style: { flex: 1, overflow: 'auto', border: '1px solid var(--pcw-border, #e2e8f0)', borderRadius: 6 } },
              eqdQuoteTable(matches, rates, toggle, null, locked, 300)))),
        eqdH("div", { "data-eqd": "basket", style: { width: 340, borderLeft: '1px solid var(--pcw-border, #e2e8f0)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' } },
          eqdH("b", null, `Basket · ${basket.length} quote${basket.length === 1 ? '' : 's'}`),
          basket.map(r => eqdH("div", { key: keyOf(r), style: { display: 'flex', gap: 6, fontSize: 11.5, padding: '4px 6px', background: 'var(--pcw-surface-2, #f8fafc)', borderRadius: 4 } },
            eqdH("div", { style: { flex: 1 } }, eqdH("div", { style: { fontWeight: 600 } }, `${r.equipment} · ${r.material} · ${gcsEqdSizeLabel(r)}`), eqdH("div", { style: { color: '#64748b' } }, `${r.vendor} · ${eqdMoney(r.price, r.ccy)} · ${r.date}`)),
            eqdH("button", { onClick: () => toggle(r), style: { border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' } }, '✕'))),
          eqdH("div", { style: { borderTop: '1px solid var(--pcw-border, #e2e8f0)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 } },
            eqdH("b", { style: { fontSize: 12 } }, 'Add as lines to'),
            eqdH("select", { className: "pcw-input text-xs", value: destSheet, onChange: ev => { setDestSheet(ev.target.value); setAfterId(''); }, "data-eqd": "dest-sheet" }, costingSheets.map(s => eqdH("option", { key: s.id, value: s.id }, s.name))),
            eqdH("select", { className: "pcw-input text-xs", value: afterId, onChange: ev => setAfterId(ev.target.value), "data-eqd": "dest-pos" }, eqdH("option", { value: '' }, 'At the end of the tab'),
              sheetRoots.map((i, k) => eqdH("option", { key: i.id, value: i.id }, `After ${k + 1}. ${i.type === 'heading' ? '— ' + (i.text || 'Heading') : [i.partNumber, i.description].filter(Boolean).join(' · ').slice(0, 60) || '(blank line)'}`))),
            eqdH("div", { style: { fontSize: 10.5, color: '#64748b' } }, 'Each quote becomes an EQD line: cost, currency, quote date, SAP item, description, model / drawing, vendor and size, with automatic scaling to the plant feed.'),
            eqdH("button", { className: "pcw-btn pcw-btn-primary", style: { fontSize: 12, padding: '5px 10px' }, disabled: !basket.length || locked, onClick: doImport, "data-eqd": "import" }, `Add ${basket.length || ''} line${basket.length === 1 ? '' : 's'}`),
            result ? eqdH("div", { "data-eqd": "result", style: { fontSize: 12, background: '#f0fdf4', color: '#166534', padding: 8, borderRadius: 4 } }, `Added ${result.added} line${result.added === 1 ? '' : 's'}.`, result.skipped ? ` ${result.skipped} skipped (no exchange rate for their currency).` : '') : null)))));
};
