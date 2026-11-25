// GCS v0.25 costing toolbar pieces: the column-view switch and the Tools (⋯) menu that holds the less-used actions.
var ctH = React.createElement;
var GcsViewSwitch = ({ colVisibility, setColVisibility, onCustom, customOpen }) => {
  var active = gcsActiveView(colVisibility);
  var btn = (id, label, tip, onClick) => ctH("button", { key: id, type: 'button', "data-view": id, "aria-pressed": active === id, title: tip, onClick,
    style: { height: 30, padding: '0 12px', border: 0, borderLeft: id === 'costing' ? 0 : '1px solid var(--pcw-border, #e2e8f0)', background: active === id ? '#2563eb' : (id === 'custom' && customOpen ? '#eff6ff' : 'var(--pcw-surface, #fff)'), color: active === id ? '#fff' : 'var(--pcw-text-primary, #1e293b)', fontSize: 12, fontWeight: active === id ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap' } }, label);
  return ctH("div", { role: 'group', "aria-label": 'Column view', "data-view-switch": active, style: { display: 'inline-flex', border: '1px solid var(--pcw-border, #cbd5e1)', borderRadius: 6, overflow: 'hidden' } },
    Object.keys(GCS_VIEWS).map(id => btn(id, GCS_VIEWS[id].label, GCS_VIEWS[id].tip, () => setColVisibility(v => gcsApplyView(v, id)))),
    btn('custom', 'Custom…', 'Choose individual columns', onCustom));
};
var CostingToolsMenu = ({ locked, addHeading, quotesN, onQuickest, onLowest, findOpen, toggleFind, loadCSV, getTemplate, exportExcel }) => {
  var [open, setOpen] = useState(false);
  var ref = useRef(null);
  useEffect(() => { if (!open) return; var f = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, [open]);
  var item = (label, onClick, o = {}) => ctH("button", { key: label, type: 'button', "data-tool": o.id, disabled: o.disabled, title: o.title, onClick: () => { setOpen(false); onClick(); },
    style: { display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left', padding: '7px 12px', fontSize: 12.5, background: 'none', border: 'none', borderRadius: 5, color: o.disabled ? '#94a3b8' : 'var(--pcw-text-primary, #1e293b)', cursor: o.disabled ? 'not-allowed' : 'pointer' },
    onMouseEnter: e => { if (!o.disabled) e.currentTarget.style.background = 'var(--pcw-surface-2, #f1f5f9)'; }, onMouseLeave: e => { e.currentTarget.style.background = 'none'; } },
    ctH("span", { style: { flex: 1 } }, label), o.hint ? ctH("span", { style: { fontSize: 11, color: '#94a3b8' } }, o.hint) : null);
  var sep = k => ctH("div", { key: k, style: { height: 1, background: 'var(--pcw-border, #e2e8f0)', margin: '4px 0' } });
  var noQ = !quotesN;
  return ctH("div", { ref, style: { position: 'relative' } },
    ctH("button", { type: 'button', className: 'pcw-btn-secondary', "data-tool": 'menu', "aria-label": 'More tools', title: 'More tools: sections, supplier quotes, find and replace, Excel', onClick: () => setOpen(o => !o), style: { fontSize: 15, padding: '2px 10px', lineHeight: 1.2, background: findOpen ? '#eff6ff' : undefined } }, '⋯'),
    open ? ctH("div", { "data-tool": 'menu-list', style: { position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: 'var(--pcw-surface, #fff)', border: '1px solid var(--pcw-border, #e2e8f0)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.14)', zIndex: 300, minWidth: 260, padding: 4 } },
      item('+ Add section heading', addHeading, { id: 'heading', disabled: locked }),
      item(findOpen ? 'Close find & replace' : 'Find & replace', toggleFind, { id: 'find', hint: 'Ctrl+H' }),
      sep('a'),
      item('Use quickest lead time', onQuickest, { id: 'quickest', disabled: locked || noQ, hint: noQ ? 'needs supplier quotes' : quotesN + ' lines', title: 'Switch lines with supplier quotes to the shortest Ex Works lead time' }),
      item('Use lowest cost', onLowest, { id: 'lowest', disabled: locked || noQ, hint: noQ ? 'needs supplier quotes' : quotesN + ' lines', title: 'Switch lines with supplier quotes to the lowest unit cost' }),
      sep('b'),
      item('Load lines from CSV…', loadCSV, { id: 'csv', disabled: locked }),
      item('CSV / paste template', getTemplate, { id: 'template' }),
      item('Export to Excel', exportExcel, { id: 'excel' }),
      ctH("div", { style: { fontSize: 11, color: '#94a3b8', padding: '6px 12px 4px', lineHeight: 1.5 } }, 'Tip: Ctrl+V pastes rows from Excel (click a cell first to fill from there). Tab, Enter and Esc move between cells.')) : null);
};
