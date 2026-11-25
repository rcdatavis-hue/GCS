
// ═══ SCM SEARCH PANEL ═════════════════════════════════════════════════════════
// Web version of the Excel GCS "SCM Search" sheet: filters, results, import basket, destination
// (tab + position, like Excel's "return to the row you came from"), import. Data: engine/scm.js.

var scmH = React.createElement;
var SCM_RESULT_LIMIT = 300;
var scmBtn = (label, onClick, o = {}) => scmH("button", { className: "pcw-btn " + (o.primary ? "pcw-btn-primary" : "pcw-btn-secondary"), style: { fontSize: 11.5, padding: '4px 10px', ...(o.style || {}) }, onClick, disabled: o.disabled, title: o.title, "data-scm": o.id }, label);
var scmCellStyle = { padding: '4px 6px', fontSize: 11.5, verticalAlign: 'top', borderBottom: '1px solid var(--pcw-border, #e2e8f0)' };

var ScmSearchPanel = function ScmSearchPanel({ onClose, costingSheets, activeSheetId, items, defaultAfterId, onImport, locked }) {
  var [lib, setLib] = useState(ScmLibrary.cached);
  var [folder, setFolder] = useState(ScmLibrary.folderName);
  var [status, setStatus] = useState('');
  var [busy, setBusy] = useState(false);
  var [f, setF] = useState({});
  var [basket, setBasket] = useState([]);   // model IDs in order added
  var [destSheet, setDestSheet] = useState(activeSheetId || (costingSheets[0] || {}).id);
  var [afterId, setAfterId] = useState(defaultAfterId || '');
  var [result, setResult] = useState(null);
  var [fileModels, setFileModels] = useState([]);   // SCM files opened directly: { model, lines, version, fileName }

  var load = async (force) => {
    setBusy(true); setStatus('Reading the SCM master index…');
    try { var l = await ScmLibrary.loadIndex(force); setLib(l); setStatus(''); }
    catch (e) { setStatus(String(e.message || e)); }
    setBusy(false);
  };
  useEffect(() => { (async () => {
    if (ScmLibrary.cached) return;
    var r = await ScmLibrary.restore();
    if (r) { setFolder(r.name); if (r.granted) load(false); else setStatus(`Click "Open library" to allow reading "${r.name}" again (the browser asks once per session).`); }
  })(); }, []);
  var pick = async () => {
    try { var n = await ScmLibrary.pick(); setFolder(n); await load(true); } catch (e) { if (e && e.name !== 'AbortError') setStatus(String(e.message || e)); }
  };
  var scan = async () => {
    setBusy(true);
    try { var l = await ScmLibrary.scanFolder((i, n) => setStatus(`Reading SCM files: ${i} of ${n}…`)); setLib(l); setStatus(`Read ${l.catalogue.length} models directly from the folder in ${(l.loadMs / 1000).toFixed(1)} s.`); }
    catch (e) { setStatus(String(e.message || e)); }
    setBusy(false);
  };
  var loadFile = () => { var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsm,.xlsx,.xlsb';
    inp.onchange = async e => { var file = e.target.files[0]; if (!file) return; setBusy(true); try { setLib(await ScmLibrary.loadIndexFromFile(file)); setStatus(`Loaded ${file.name}. Imports use the lines in the index (no folder to open the model files from).`); } catch (er) { setStatus(String(er.message || er)); } setBusy(false); };
    inp.click(); };

  // Open one or more SCM model files directly (no index or folder needed) and put them in the basket.
  var openModelFiles = () => { var inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.xlsx,.xlsm,.xlsb'; inp.setAttribute('data-scm', 'model-file-input');
    inp.onchange = async e => { var files = [...(e.target.files || [])]; if (!files.length) return; setBusy(true); var added = [], errs = [];
      for (var file of files) {
        try { var wb = XLSX.read(await file.arrayBuffer(), { dense: true }); var p = scmParseModelFile(wb, file.name);
          var info = p.info || {}; var model = { ...info, 'Model ID': scmText(info['Model ID']) || file.name.replace(/\.[^.]+$/, ''), 'Model Description': scmText(info['Model Description']) || file.name.replace(/\.[^.]+$/, ''), 'File Name': file.name };
          added.push({ key: 'file:' + file.name + ':' + Date.now() + ':' + added.length, model, lines: p.lines, version: p.version, fileName: file.name }); }
        catch (er) { errs.push(`${file.name}: ${er.message || er}`); } }
      setFileModels(fm => [...fm, ...added]);
      setStatus(errs.length ? 'Could not read: ' + errs.join('; ') : `Added ${added.length} SCM file${added.length === 1 ? '' : 's'} to the basket (${added.map(a => 'V' + a.version + ', ' + a.lines.length + ' lines').join('; ')}).`);
      setBusy(false); };
    document.body.appendChild(inp); inp.style.display = 'none'; inp.click(); setTimeout(() => inp.remove(), 60000); };

  var options = useMemo(() => (lib ? scmFilterOptions(lib.catalogue) : {}), [lib]);
  var results = useMemo(() => (lib ? scmSearch(lib, f) : []), [lib, f]);
  var byId = useMemo(() => new Map((lib ? lib.catalogue : []).map(m => [m['Model ID'], m])), [lib]);
  var inBasket = id => basket.includes(id);
  var toggle = id => setBasket(b => (b.includes(id) ? b.filter(x => x !== id) : [...b, id]));
  var basketModels = basket.map(id => byId.get(id)).filter(Boolean);
  var basketLines = basketModels.reduce((s, m) => s + ((lib && lib.linesByModel.get(m['Model ID'])) || []).length, 0) + fileModels.reduce((s, m) => s + m.lines.length, 0);
  var basketCount = basket.length + fileModels.length;
  var notApproved = basketModels.concat(fileModels.map(x => x.model)).filter(m => scmText(m.Status) && scmText(m.Status).toUpperCase() !== 'APPROVED');
  var dq = lib ? lib.dataQuality.filter(d => basket.includes(d['Model ID'])) : [];
  var sheetRoots = (items || []).filter(i => (i.sheetId || (costingSheets[0] || {}).id) === destSheet && !i.parentId);
  var setFilter = (k, v) => setF(p => ({ ...p, [k]: v }));

  var doImport = async () => {
    if (!basketCount || locked) return;
    setBusy(true); setResult(null);
    var models = [], notes = [];
    for (var m of basketModels) {
      setStatus(`Opening ${m['Model Description'] || m['Model ID']}…`);
      var fromFile = null;
      try { fromFile = lib.source === 'scan' || folder ? await ScmLibrary.openModel(m) : null; } catch (e) { notes.push(`${m['Model Description']}: could not read its file (${e.message}); used the index lines.`); }
      if (fromFile) {
        if (m['Modified Date'] && fromFile.modified && fromFile.modified.slice(0, 16) > scmText(m['Modified Date']).slice(0, 16)) notes.push(`${m['Model Description']}: the file was changed after the last index refresh; imported the file's current lines.`);
        models.push({ model: { ...m, Revision: fromFile.info.Revision || m.Revision, Status: fromFile.info.Status || m.Status }, lines: fromFile.lines, version: fromFile.version, fileName: fromFile.fileName, fromIndex: false });
      } else {
        if (folder && lib.source !== 'file') notes.push(`${m['Model Description']}: file "${m['File Name']}" not found in the folder; used the index lines.`);
        models.push({ model: m, lines: (lib.linesByModel.get(m['Model ID']) || []), version: 1, fileName: m['File Name'], fromIndex: true });
      }
    }
    fileModels.forEach(x => models.push({ model: x.model, lines: x.lines, version: x.version, fileName: x.fileName, fromIndex: false }));
    setStatus('Placing lines and looking up costs…');
    try {
      var s = await onImport({ models, sheetId: destSheet, afterId: afterId || null });
      setResult({ ...s, notes: notes.concat(s.notes || []) }); setBasket([]); setFileModels([]); setStatus('');
    } catch (e) { setStatus('Import failed: ' + (e.message || e)); }
    setBusy(false);
  };

  var sel = (k, label, opts) => scmH("label", { style: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' } }, label,
    scmH("select", { className: "pcw-input text-xs", value: f[k] || '', onChange: e => setFilter(k, e.target.value), "data-scm-filter": k }, scmH("option", { value: '' }, 'Any'), (opts || []).map(o => scmH("option", { key: o, value: o }, o))));
  var txt = (k, label, ph) => scmH("label", { style: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' } }, label,
    scmH("input", { className: "pcw-input text-xs", value: f[k] || '', placeholder: ph || 'contains…', onChange: e => setFilter(k, e.target.value), "data-scm-filter": k }));
  var th = t => scmH("th", { style: { ...scmCellStyle, position: 'sticky', top: 0, background: 'var(--pcw-surface-2, #f1f5f9)', fontSize: 10, textTransform: 'uppercase', color: '#475569', textAlign: 'left', zIndex: 1 } }, t);

  return scmH("div", { style: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 1000, display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: 18 }, onMouseDown: e => { if (e.target === e.currentTarget) onClose(); } },
    scmH("div", { "data-scm": "panel", style: { background: 'var(--pcw-surface, #fff)', borderRadius: 10, width: '100%', maxWidth: 1600, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.3)' } },
      // header
      scmH("div", { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--pcw-border, #e2e8f0)', flexWrap: 'wrap' } },
        scmH("div", { style: { fontWeight: 800, fontSize: 15 } }, "Sales Cost Model Search"),
        scmH("div", { style: { fontSize: 11.5, color: '#475569' }, "data-scm": "source" }, lib
          ? `${lib.catalogue.length} models · ${[...lib.linesByModel.values()].reduce((s, a) => s + a.length, 0).toLocaleString()} lines · ${lib.source === 'scan' ? 'read from the SCM files' : (lib.indexFile || 'master index') + (lib.refreshLog && lib.refreshLog['Refresh Completed'] ? ' · index refreshed ' + String(lib.refreshLog['Refresh Completed']).slice(0, 16) : '')}${folder ? ' · folder "' + folder + '"' : ''}`
          : (folder ? `Folder "${folder}"` : 'No SCM library selected')),
        scmH("div", { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
          ScmLibrary.supported() ? scmBtn(folder ? 'Change folder' : 'Choose SCM folder', pick, { title: 'Pick the synced Commercial Costing Program folder (holds SCM_Master_Index and the SCM files)', id: 'pick' }) : null,
          folder ? scmBtn(lib ? 'Reload index' : 'Open library', () => load(true), { disabled: busy, id: 'reload' }) : null,
          folder ? scmBtn('Read SCM files directly', scan, { disabled: busy, title: 'Build the list from every SCM file in the folder instead of the master index (slower; use if the index is missing or out of date)', id: 'scan' }) : null,
          scmBtn('Import SCM file(s)…', openModelFiles, { disabled: busy, title: 'Open one or more SCM model files (.xlsx) directly and add them to the basket — no index or folder needed', id: 'model-file', primary: !lib }),
          scmBtn('Load index file…', loadFile, { disabled: busy, title: 'Open SCM_Master_Index_v1.xlsm directly (imports then use the index lines)', id: 'file' }),
          scmBtn('Close', onClose, { id: 'close' }))),
      status ? scmH("div", { "data-scm": "status", style: { padding: '6px 14px', fontSize: 12, background: '#fffbeb', color: '#92400e', borderBottom: '1px solid #fde68a' } }, status) : null,
      !ScmLibrary.supported() ? scmH("div", { style: { padding: '6px 14px', fontSize: 12, background: '#fef2f2', color: '#991b1b' } }, 'This browser cannot open folders. Use Chrome or Edge, or load the index file.') : null,
      // body
      scmH("div", { style: { display: 'flex', flex: 1, minHeight: 0 } },
        // left: filters + results
        scmH("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 } },
          scmH("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(120px,1fr))', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--pcw-border, #e2e8f0)' } },
            txt('keyword', 'Keyword', 'ID, description, SAP, process, material'), txt('rootSap', 'Root SAP Item'), txt('drawing', 'Drawing Number', 'searches every model line'),
            sel('segment', 'Segment', options.segment), sel('subSegment', 'Sub/Segment', options.subSegment), sel('process', 'Major Process', options.process),
            sel('material', 'Material', options.material), sel('rate', 'Rate', options.rate), sel('status', 'Status', options.status),
            sel('bu', 'Location (BU)', options.bu), txt('customer', 'Reference Customer'), txt('so', 'Reference SO / Project')),
          scmH("div", { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', fontSize: 12 } },
            scmH("b", { "data-scm": "count" }, `${results.length} result${results.length === 1 ? '' : 's'}`),
            results.length > SCM_RESULT_LIMIT ? scmH("span", { style: { color: '#64748b' } }, `showing the first ${SCM_RESULT_LIMIT}; narrow the filters`) : null,
            Object.values(f).some(Boolean) ? scmBtn('Clear filters', () => setF({}), { id: 'clear' }) : null,
            scmH("span", { style: { color: '#64748b' } }, 'Click a row to add it to the basket.')),
          scmH("div", { style: { flex: 1, overflow: 'auto', margin: '0 14px 12px', border: '1px solid var(--pcw-border, #e2e8f0)', borderRadius: 6 } },
            scmH("table", { style: { width: '100%', borderCollapse: 'collapse' } },
              scmH("thead", null, scmH("tr", null, th(''), th('Model description'), th('Root SAP'), th('BU'), th('Reference customer'), th('SO / project'), th('Segment'), th('Rate'), th('Sub/Segment'), th('Process'), th('Material'), th('Status'), th('Rev.'), th('Matched drawing'), th('Lines'), th('Modified'))),
              scmH("tbody", null, results.slice(0, SCM_RESULT_LIMIT).map(r => { var m = r.model, id = m['Model ID'], on = inBasket(id);
                return scmH("tr", { key: id, "data-scm-row": id, onClick: () => toggle(id), style: { cursor: 'pointer', background: on ? '#eff6ff' : undefined }, title: id },
                  scmH("td", { style: { ...scmCellStyle, width: 22, color: on ? '#2563eb' : '#cbd5e1', fontWeight: 800 } }, on ? '✓' : '+'),
                  scmH("td", { style: { ...scmCellStyle, fontWeight: 600, minWidth: 200 } }, m['Model Description'] || id),
                  scmH("td", { className: "pcw-mono", style: scmCellStyle }, m['Root SAP Item']), scmH("td", { style: scmCellStyle }, m['Business Unit']),
                  scmH("td", { style: { ...scmCellStyle, maxWidth: 180 } }, m['Reference Customer']), scmH("td", { className: "pcw-mono", style: scmCellStyle }, m['Reference SO / Project']),
                  scmH("td", { style: scmCellStyle }, m.Segment), scmH("td", { style: { ...scmCellStyle, whiteSpace: 'nowrap' } }, m.Rate), scmH("td", { style: scmCellStyle }, m['Sub/Segment']),
                  scmH("td", { style: scmCellStyle }, m['Major Process']), scmH("td", { style: scmCellStyle }, m.Material),
                  scmH("td", { style: { ...scmCellStyle, color: scmText(m.Status).toUpperCase() === 'APPROVED' ? '#16a34a' : '#b45309', fontWeight: 600 } }, m.Status),
                  scmH("td", { style: scmCellStyle }, m.Revision), scmH("td", { style: { ...scmCellStyle, maxWidth: 200 } }, r.matchedDrawing ? `${r.matchedDrawing} — ${r.matchedItem}` : ''),
                  scmH("td", { style: { ...scmCellStyle, textAlign: 'right' } }, r.lineCount), scmH("td", { style: { ...scmCellStyle, whiteSpace: 'nowrap', color: '#64748b' } }, scmText(m['Modified Date']).slice(0, 10)));
              })))),
          !lib && !busy ? scmH("div", { style: { padding: '0 14px 14px', fontSize: 12.5, color: '#475569' } },
            'Choose the synced ', scmH("b", null, 'Commercial Costing Program'), ' folder (OneDrive). It must contain SCM_Master_Index_v1.xlsm and the Sales Cost Models folder. Tip: set the folder to "Always keep on this device" so files open instantly.') : null),
        // right: basket + destination
        scmH("div", { "data-scm": "basket", style: { width: 360, borderLeft: '1px solid var(--pcw-border, #e2e8f0)', display: 'flex', flexDirection: 'column', padding: 12, gap: 10, overflow: 'auto' } },
          scmH("div", { style: { display: 'flex', alignItems: 'center', gap: 8 } }, scmH("b", null, 'Import basket'), scmH("span", { style: { fontSize: 12, color: '#475569' }, "data-scm": "basket-count" }, `${basketCount} model${basketCount === 1 ? '' : 's'} · ${basketLines} lines`),
            basketCount ? scmBtn('Clear', () => { setBasket([]); setFileModels([]); }, { style: { marginLeft: 'auto' }, id: 'basket-clear' }) : null),
          fileModels.length ? scmH("div", { style: { display: 'flex', flexDirection: 'column', gap: 4 }, "data-scm": "file-models" }, fileModels.map(x => scmH("div", { key: x.key, style: { display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, padding: '4px 6px', background: '#f5f3ff', borderRadius: 4 } },
            scmH("div", { style: { flex: 1 } }, scmH("div", { style: { fontWeight: 600 } }, x.model['Model Description']),
              scmH("div", { style: { fontSize: 10.5, color: '#64748b' } }, `File · V${x.version} · ${x.lines.length} lines${x.model.Rate ? ' · ' + scmText(x.model.Rate) : ''}${x.model['Business Unit'] ? ' · ' + scmText(x.model['Business Unit']) : ''}${x.model.Status ? ' · ' + scmText(x.model.Status) : ''}`)),
            scmH("button", { onClick: () => setFileModels(fm => fm.filter(y => y.key !== x.key)), title: 'Remove from basket', style: { border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' } }, '\u2715')))) : null,
          scmH("div", { style: { display: 'flex', flexDirection: 'column', gap: 4 } }, basketModels.map(m => scmH("div", { key: m['Model ID'], style: { display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, padding: '4px 6px', background: 'var(--pcw-surface-2, #f8fafc)', borderRadius: 4 } },
            scmH("div", { style: { flex: 1 } }, scmH("div", { style: { fontWeight: 600 } }, m['Model Description']), scmH("div", { style: { fontSize: 10.5, color: '#64748b' } }, `${m.Rate || ''} · ${m['Business Unit'] || ''} · ${m.Status || ''}`)),
            scmH("button", { onClick: () => toggle(m['Model ID']), title: 'Remove', style: { border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' } }, '✕')))),
          notApproved.length ? scmH("div", { style: { fontSize: 11.5, background: '#fffbeb', color: '#92400e', padding: 8, borderRadius: 4 } }, `${notApproved.length} model${notApproved.length === 1 ? ' is' : 's are'} not Approved (${[...new Set(notApproved.map(m => m.Status))].join(', ')}). You can still import; check the costs.`) : null,
          dq.length ? scmH("div", { style: { fontSize: 11.5, background: '#fef2f2', color: '#991b1b', padding: 8, borderRadius: 4 } }, scmH("b", null, 'Index data-quality warnings'), dq.slice(0, 6).map((d, i) => scmH("div", { key: i }, `• ${d['Issue Type']}: ${d['Model Description'] || ''} — ${d.Details}`))) : null,
          scmH("div", { style: { borderTop: '1px solid var(--pcw-border, #e2e8f0)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 } },
            scmH("b", { style: { fontSize: 12 } }, 'Import into'),
            scmH("select", { className: "pcw-input text-xs", value: destSheet, onChange: e => { setDestSheet(e.target.value); setAfterId(''); }, "data-scm": "dest-sheet" }, costingSheets.map(s => scmH("option", { key: s.id, value: s.id }, s.name))),
            scmH("select", { className: "pcw-input text-xs", value: afterId, onChange: e => setAfterId(e.target.value), "data-scm": "dest-pos" },
              scmH("option", { value: '' }, 'At the end of the tab'),
              sheetRoots.map((i, k) => scmH("option", { key: i.id, value: i.id }, `After ${k + 1}. ${i.type === 'heading' ? '— ' + (i.description || 'Heading') : [i.partNumber, i.description].filter(Boolean).join(' · ').slice(0, 60) || '(blank line)'}`))),
            scmH("div", { style: { fontSize: 10.5, color: '#64748b' } }, 'Each model comes in under a heading line. SAP items go into Part No.; cost, supplier and cost date come from the latest PO/PQ in the feed. Quantities are copied as they are. V2 models keep their BOM levels: assemblies become header rows that total the lines under them, start collapsed below the top level, and rescale their lines when you change their quantity.'),
            scmBtn(busy ? 'Working…' : `Import ${basketCount || ''} model${basketCount === 1 ? '' : 's'}`, doImport, { primary: true, disabled: busy || !basketCount || locked, id: 'import', title: locked ? 'The project is locked' : '' }),
            result ? scmH("div", { "data-scm": "result", style: { fontSize: 12, background: '#f0fdf4', color: '#166534', padding: 8, borderRadius: 4 } },
              `Imported ${result.models} model${result.models === 1 ? '' : 's'}, ${result.lines} lines. `,
              result.feed ? `${result.costed} costed from PO/PQ history; ${result.noCost} without a cost.` : 'Feed file not connected, so no costs were filled in. Connect it and use the row autofill, or type costs.',
              (result.notes || []).map((n, i) => scmH("div", { key: i, style: { color: '#92400e', marginTop: 4 } }, '• ' + n))) : null)))));
};

// Default import position: the top-level line holding the focused cell (or the last selected line) on the active tab.
var scmDefaultAnchor = (items, focusedCell, selectedItems, activeSheetId, costingSheets) => {
  var first = (costingSheets[0] || {}).id, byId = new Map((items || []).map(i => [i.id, i]));
  var pick = focusedCell && focusedCell.itemId ? focusedCell.itemId : (selectedItems && selectedItems.size ? [...selectedItems].pop() : null);
  var it = pick ? byId.get(pick) : null, guard = 0;
  while (it && it.parentId && guard++ < 50) it = byId.get(it.parentId);
  return it && (it.sheetId || first) === activeSheetId ? it.id : '';
};
