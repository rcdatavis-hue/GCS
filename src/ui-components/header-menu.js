// GCS header: feed status pill, Save menu (save, package, auto-save, open, compare, PDF) and the ⋯ menu
// (preferences, dark mode, reset, version). Replaces the full-width feed banner, the Upload / Reset / dark-mode
// buttons and the Preferences / Save & Restore cards that used to sit in Setup.
var hmH = React.createElement;
var useHmOutside = (open, setOpen) => {
  var ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    var f = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    var k = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', f); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k); };
  }, [open]);
  return ref;
};
var hmMenuBox = { position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, minWidth: 250, zIndex: 1200, boxShadow: '0 8px 24px rgba(0,0,0,.45)', padding: 4 };
var hmItem = (label, onClick, o = {}) => hmH("button", { type: 'button', key: o.key || label, "data-hm": o.id, disabled: o.disabled, onClick, title: o.title,
  style: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 12.5, color: o.danger ? '#fca5a5' : o.disabled ? '#64748b' : '#e2e8f0', background: 'none', border: 'none', borderRadius: 5, cursor: o.disabled ? 'not-allowed' : 'pointer' },
  onMouseEnter: e => { if (!o.disabled) e.currentTarget.style.background = '#334155'; }, onMouseLeave: e => { e.currentTarget.style.background = 'none'; } },
  hmH("span", { style: { flex: 1 } }, label), o.hint ? hmH("span", { style: { fontSize: 11, color: '#94a3b8' } }, o.hint) : null);
var hmSep = k => hmH("div", { key: k, style: { height: 1, background: '#334155', margin: '4px 2px' } });
var hmHead = (t, k) => hmH("div", { key: k, style: { fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', textTransform: 'uppercase', padding: '6px 10px 2px' } }, t);
var hmBtnStyle = { height: 30, padding: '0 11px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' };

var FeedPill = ({ fsConnected, fsStale, fsLoading, fsConnecting, fsConnect, fsFileName, goSetup }) => {
  var st = fsLoading ? { bg: '#1e3a8a', fg: '#bfdbfe', dot: '#60a5fa', label: 'Loading feed…', title: 'Reading ' + (fsFileName || 'the feed file') }
    : fsStale ? { bg: '#450a0a', fg: '#fecaca', dot: '#ef4444', label: fsConnecting ? 'Reconnecting…' : 'Feed lost · reconnect', title: 'The browser dropped the feed file. Click to reconnect.', act: fsConnect }
    : !fsConnected ? { bg: '#3b2f12', fg: '#fcd34d', dot: '#f59e0b', label: fsConnecting ? 'Opening…' : 'Feed not connected', title: 'Autofill, cost lookups, price history and supplier search need the PCW feed. Click to connect it.', act: fsConnect }
    : { bg: 'transparent', fg: '#94a3b8', dot: '#22c55e', label: 'Feed', title: (fsFileName || 'PCW feed') + ' — connected. Click for feed settings.', act: goSetup };
  return hmH("button", { type: 'button', "data-feed-pill": fsLoading ? 'loading' : fsStale ? 'stale' : fsConnected ? 'on' : 'off', onClick: st.act, disabled: !st.act || fsConnecting, title: st.title,
    style: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 13, border: st.bg === 'transparent' ? '1px solid #334155' : 'none', background: st.bg, color: st.fg, fontSize: 12, fontWeight: 500, cursor: st.act ? 'pointer' : 'default', whiteSpace: 'nowrap' } },
    hmH("span", { style: { width: 7, height: 7, borderRadius: '50%', background: st.dot, flexShrink: 0 } }), st.label);
};

var SaveMenu = ({ downloadJSON, exportPackage, exportPDF, connectSaveFile, disconnectSaveFile, saveFileConnected, saveFileStale, saveFileName, uploadJSON, setShowCompareIntro, locked, saveStatusLabel }) => {
  var [open, setOpen] = useState(false);
  var ref = useHmOutside(open, setOpen);
  var go = f => () => { setOpen(false); f(); };
  var autoLabel = saveFileConnected && !saveFileStale ? 'Auto-save on' : saveFileStale ? 'Auto-save: reconnect' : 'Auto-save to a file…';
  return hmH("div", { ref, style: { position: 'relative' } },
    hmH("button", { type: 'button', "data-hm": "save", onClick: () => setOpen(o => !o), title: saveFileConnected && !saveFileStale ? 'Saving automatically to ' + saveFileName : 'Save options', style: hmBtnStyle },
      saveFileConnected && !saveFileStale ? hmH("span", { style: { width: 7, height: 7, borderRadius: '50%', background: '#22c55e' } }) : saveFileStale ? hmH("span", { style: { width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' } }) : null,
      'Save', hmH("span", { style: { fontSize: 9, color: '#94a3b8' } }, '▾')),
    open ? hmH("div", { style: hmMenuBox, "data-hm": "save-menu" },
      hmItem('Save .gcs file', go(downloadJSON), { id: 'save-gcs', hint: 'project backup' }),
      hmItem('Save package (.zip)', go(exportPackage), { id: 'save-package', hint: 'issue a quote' }),
      hmItem('Export PDF', go(exportPDF), { id: 'save-pdf' }),
      hmSep('s1'),
      hmItem(autoLabel, go(() => connectSaveFile(false)), { id: 'save-auto', hint: saveFileConnected && !saveFileStale ? saveFileName : saveFileStale ? saveFileName : 'saves 2 s after each change', disabled: saveFileConnected && !saveFileStale }),
      saveFileConnected || saveFileStale ? hmItem('Stop auto-saving', go(disconnectSaveFile), { id: 'save-auto-off' }) : null,
      hmSep('s2'),
      hmItem('Open a .gcs file…', go(uploadJSON), { id: 'save-open', disabled: locked, title: locked ? 'Unlock the revision to open another file' : 'Replace this project with a saved .gcs file' }),
      hmItem('Compare revisions…', go(() => setShowCompareIntro(true)), { id: 'save-compare' }),
      saveStatusLabel ? hmH("div", { style: { fontSize: 11, color: '#94a3b8', padding: '6px 10px 4px' } }, saveStatusLabel) : null) : null);
};

var HeaderMenu = ({ darkMode, setDarkMode, clearSave, language, setLanguage, dateFormat, setDateFormat, tableGridlines, setTableGridlines, tableIntenseColors, setTableIntenseColors, tableDensity, setTableDensity, onShortcuts }) => {
  var [open, setOpen] = useState(false);
  var ref = useHmOutside(open, setOpen);
  var sel = (value, onChange, opts, id) => hmH("select", { value, onChange: e => onChange(e.target.value), "data-hm": id, style: { background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 5, fontSize: 12, padding: '3px 4px', maxWidth: 150 } }, opts.map(([v, l]) => hmH("option", { key: v, value: v }, l)));
  var row = (label, ctl, k) => hmH("div", { key: k, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', fontSize: 12.5, color: '#e2e8f0' } }, hmH("span", { style: { flex: 1 } }, label), ctl);
  var chk = (checked, onChange, id) => hmH("input", { type: 'checkbox', checked: !!checked, onChange: e => onChange(e.target.checked), "data-hm": id, style: { width: 14, height: 14, accentColor: '#3b82f6' } });
  return hmH("div", { ref, style: { position: 'relative' } },
    hmH("button", { type: 'button', "data-hm": "more", "aria-label": 'More options', title: 'Preferences, dark mode, reset', onClick: () => setOpen(o => !o), style: { ...hmBtnStyle, padding: '0 9px', fontSize: 15, letterSpacing: 1 } }, '⋯'),
    open ? hmH("div", { style: { ...hmMenuBox, minWidth: 290 }, "data-hm": "more-menu" },
      hmHead('Preferences', 'h1'),
      row('Language', sel(language, setLanguage, [['en', 'English'], ['es', 'Español'], ['pt', 'Português (Brasil)']], 'pref-lang'), 'lang'),
      row('Date format', sel(dateFormat, setDateFormat, [['us', 'US (MM/DD/YYYY)'], ['uk', 'UK (DD/MM/YYYY)']], 'pref-date'), 'date'),
      row('Row density', sel(tableDensity, setTableDensity, [['compact', 'Compact'], ['normal', 'Normal'], ['comfortable', 'Comfortable']], 'pref-density'), 'dens'),
      row('Cell gridlines', chk(tableGridlines, setTableGridlines, 'pref-grid'), 'grid'),
      row('Row status colours', chk(tableIntenseColors, setTableIntenseColors, 'pref-status'), 'stat'),
      row('Dark mode', chk(darkMode, setDarkMode, 'pref-dark'), 'dark'),
      hmSep('m1'),
      onShortcuts ? hmItem('Keyboard shortcuts', () => { setOpen(false); onShortcuts(); }, { id: 'shortcuts' }) : null,
      hmItem('Reset project…', () => { setOpen(false); clearSave(); }, { id: 'reset', danger: true, hint: 'clears all data' }),
      hmSep('m2'),
      hmH("div", { style: { fontSize: 11, color: '#64748b', padding: '4px 10px 6px' }, title: 'If something behaves oddly, check this matches the latest version' }, `Global Cost Sheet ${PCW_VERSION} · build ${PCW_BUILD}`)) : null);
};
