

// ═══ SALES COST MODELS (SCM) ══════════════════════════════════════════════════
// Replaces the Excel GCS "SCM Search" sheet and its VBA (modSCMWorksheetSearch, modSCMSearchFastImport,
// modSCMImporterUnified). See project doc claude/GCS_SCM_IMPORT_NOTES.md.
//
// Data: the SharePoint library "Commercial Costing Program", synced with OneDrive and picked once as a
// folder. It holds SCM_Master_Index_v1.xlsm (catalogue + every model line, refreshed by its own query)
// and the folder of SCM files ("Sales Cost Models (Test)"). Search runs on the master index; an import
// opens that model's own SCM file so its latest edits and V2 fields (BOM Level, Tag Number, Supplier
// Reference, Parent Row ID) come through. Without the index the folder can be scanned file by file.

const SCM_IDB_KEY_FOLDER = 'scm-folder-handle';
const SCM_INDEX_PATTERN = /^scm_master_index.*\.xls[xmb]$/i;
const SCM_FILE_PATTERN = /\.(xlsx|xlsm|xlsb)$/i;
const SCM_CATALOGUE_FIELDS = ['Read Check', 'Validation Status', 'Model ID', 'Model Description', 'Root SAP Item', 'Business Unit',
  'Segment', 'Sub/Segment', 'Major Process', 'Material', 'Rate', 'Revision', 'Status', 'Reference Customer', 'Reference SO / Project',
  'Costing Requested Date', 'Costing Completed Date', 'File Name', 'Modified Date', 'Folder Path', 'File URL'];
// Model-table headers accepted (same spellings as the Excel importer)
const SCM_LINE_HEADERS = {
  sap: ['SAP Item Number', 'SAP Item No.', 'Item Number'],
  description: ['Item Description', 'Description'],
  drawing: ['Model / Drawing', 'Drawing', 'Drawing Number'],
  qty: ['Quantity', 'Qty', 'Qty.'],
  notes: ['Notes'],
  bomLevel: ['BOM Level', 'BOMLevel'],
  tag: ['Tag Number', 'Tag'],
  supplierRef: ['Supplier Reference', 'Supplier Ref', 'SupplierReference'],
  parentRowId: ['Parent Row ID', 'Parent Row', 'Parent ID'],
  lineNo: ['Line Number', 'Line No', 'Line'],
  modelId: ['Model ID'],
  sourceFile: ['Source File'],
};

const scmText = v => (v === null || v === undefined ? '' : String(v).trim());
const scmNorm = v => scmText(v).toLowerCase().replace(/\s+/g, ' ');
const scmSerialToISO = v => (typeof v === 'number' && v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 19).replace('T', ' ') : scmText(v));

// Find the header row (first row containing all required headers) and map field → column index.
const scmHeaderMap = (rows, required, optional, maxScan = 15) => {
  for (let r = 0; r < Math.min(rows.length, maxScan); r++) {
    const cells = (rows[r] || []).map(scmNorm);
    const find = names => { for (const n of names) { const i = cells.indexOf(n.toLowerCase()); if (i >= 0) return i; } return -1; };
    const map = {};
    let ok = true;
    for (const f of required) { map[f] = find(SCM_LINE_HEADERS[f] || [f]); if (map[f] < 0) { ok = false; break; } }
    if (!ok) continue;
    for (const f of optional) map[f] = find(SCM_LINE_HEADERS[f] || [f]);
    return { row: r, map };
  }
  return null;
};
const scmRows = ws => (ws ? XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '', raw: true }) : []);
const scmSheet = (wb, name) => { const n = wb.SheetNames.find(s => s.trim().toLowerCase() === name.toLowerCase()); return n ? wb.Sheets[n] : null; };

// ── Master index workbook → { catalogue, linesByModel, dataQuality, refreshLog } ──
const scmParseMasterIndex = wb => {
  const catRows = scmRows(scmSheet(wb, 'SCM Catalogue'));
  const ch = (() => { for (let r = 0; r < Math.min(catRows.length, 10); r++) if ((catRows[r] || []).map(scmNorm).includes('model id')) return r; return -1; })();
  if (ch < 0) throw new Error('The master index has no "SCM Catalogue" sheet with a Model ID column.');
  const hdr = catRows[ch].map(scmText);
  const catalogue = catRows.slice(ch + 1).map(r => {
    const o = {}; hdr.forEach((h, i) => { if (h) o[h] = r[i]; });
    o['Model ID'] = scmText(o['Model ID']); o['Root SAP Item'] = scmText(o['Root SAP Item']); o['Reference SO / Project'] = scmText(o['Reference SO / Project']);
    o['Modified Date'] = scmSerialToISO(o['Modified Date']);
    return o;
  }).filter(o => o['Model ID']);
  const lineRows = scmRows(scmSheet(wb, 'SCM Model Lines'));
  const lh = scmHeaderMap(lineRows, ['modelId', 'sap', 'description', 'qty'], ['drawing', 'notes', 'lineNo', 'sourceFile', 'bomLevel', 'tag', 'supplierRef', 'parentRowId']);
  const linesByModel = new Map();
  if (lh) lineRows.slice(lh.row + 1).forEach(r => {
    const id = scmText(r[lh.map.modelId]); if (!id) return;
    const g = (f) => (lh.map[f] >= 0 ? r[lh.map[f]] : '');
    if (!linesByModel.has(id)) linesByModel.set(id, []);
    linesByModel.get(id).push({ lineNo: g('lineNo'), sap: scmText(g('sap')), description: scmText(g('description')), drawing: scmText(g('drawing')),
      qty: g('qty'), notes: scmText(g('notes')), bomLevel: g('bomLevel'), tag: scmText(g('tag')), supplierRef: scmText(g('supplierRef')), parentRowId: scmText(g('parentRowId')) });
  });
  const dqRows = scmRows(scmSheet(wb, 'Data Quality'));
  const dqh = dqRows.findIndex(r => (r || []).map(scmNorm).includes('severity'));
  const dataQuality = dqh < 0 ? [] : dqRows.slice(dqh + 1).map(r => { const h = dqRows[dqh].map(scmText); const o = {}; h.forEach((k, i) => { if (k) o[k] = scmText(r[i]); }); return o; }).filter(o => o['Model ID'] || o['Details']);
  const logRows = scmRows(scmSheet(wb, 'Refresh Log'));
  const lgh = logRows.findIndex(r => (r || []).map(scmNorm).includes('refresh completed'));
  let refreshLog = null;
  if (lgh >= 0 && logRows[lgh + 1]) { const h = logRows[lgh].map(scmText); refreshLog = {}; h.forEach((k, i) => { if (k) refreshLog[k] = /started|completed/i.test(k) ? scmSerialToISO(logRows[lgh + 1][i]) : logRows[lgh + 1][i]; }); }
  return { catalogue, linesByModel, dataQuality, refreshLog, source: 'index' };
};

// ── One SCM file → { info, lines, version } ──
const scmParseModelFile = (wb, fileName) => {
  const info = {};
  scmRows(scmSheet(wb, 'Model Info')).forEach(r => {
    for (let c = 0; c < r.length - 1; c++) { const k = scmText(r[c]); if (k && !(k in info)) { info[k] = r[c + 1]; break; } }
  });
  ['Model ID', 'Root SAP Item', 'Reference SO / Project', 'Revision', 'Status'].forEach(k => { if (k in info) info[k] = scmText(info[k]); });
  // The model table: the sheet named "Model", else the first sheet with the required headers
  const candidates = [scmSheet(wb, 'Model'), ...wb.SheetNames.map(n => wb.Sheets[n])].filter(Boolean);
  let found = null, rows = null;
  for (const ws of candidates) { rows = scmRows(ws); found = scmHeaderMap(rows, ['sap', 'description', 'drawing', 'qty'], ['notes', 'bomLevel', 'tag', 'supplierRef', 'parentRowId', 'lineNo']); if (found) break; }
  if (!found) throw new Error(`${fileName || 'SCM file'}: no model table (needs SAP Item Number, Item Description, Model / Drawing, Quantity).`);
  const g = (r, f) => (found.map[f] >= 0 ? r[found.map[f]] : '');
  const lines = rows.slice(found.row + 1).map((r, i) => ({ lineNo: g(r, 'lineNo') || i + 1, sap: scmText(g(r, 'sap')), description: scmText(g(r, 'description')),
    drawing: scmText(g(r, 'drawing')), qty: g(r, 'qty'), notes: scmText(g(r, 'notes')), bomLevel: g(r, 'bomLevel'), tag: scmText(g(r, 'tag')),
    supplierRef: scmText(g(r, 'supplierRef')), parentRowId: scmText(g(r, 'parentRowId')) }))
    .filter(l => l.sap || l.description);
  const declared = Number(info['SCM Format Version']) || 0;
  const hasLevels = found.map.bomLevel >= 0 && lines.some(l => scmText(l.bomLevel) !== '');
  const version = declared >= 2 || hasLevels ? 2 : 1;
  if (declared >= 2 && found.map.bomLevel < 0) throw new Error(`${fileName || 'SCM file'} declares Format Version 2 but has no BOM Level column.`);
  return { info, lines, version, fileName };
};

// ── Search (Excel SearchSCMCatalogue / CatalogueRowMatches) ──
// Contains: keyword (Model ID + Description + Root SAP + Major Process + Material), Root SAP Item,
// Reference Customer, Reference SO / Project, Drawing Number (searched across the model lines).
// Exact (when set): Segment, Sub/Segment, Major Process, Material, Rate, Status, Business Unit.
const SCM_EXACT_FILTERS = [['segment', 'Segment'], ['subSegment', 'Sub/Segment'], ['process', 'Major Process'], ['material', 'Material'],
  ['rate', 'Rate'], ['status', 'Status'], ['bu', 'Business Unit']];
const scmFilterOptions = catalogue => {
  const out = {};
  SCM_EXACT_FILTERS.forEach(([k, col]) => { out[k] = [...new Set(catalogue.map(m => scmText(m[col])).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); });
  return out;
};
const scmSearch = (lib, f) => {
  if (!lib) return [];
  const has = (hay, needle) => !needle || scmText(hay).toLowerCase().includes(needle.toLowerCase().trim());
  const drawing = scmText(f.drawing).toLowerCase();
  const out = [];
  for (const m of lib.catalogue) {
    const combined = [m['Model ID'], m['Model Description'], m['Root SAP Item'], m['Major Process'], m['Material']].map(scmText).join(' ');
    if (!has(combined, f.keyword) || !has(m['Root SAP Item'], f.rootSap) || !has(m['Reference Customer'], f.customer) || !has(m['Reference SO / Project'], f.so)) continue;
    if (SCM_EXACT_FILTERS.some(([k, col]) => f[k] && scmText(m[col]) !== f[k])) continue;
    let matchedDrawing = '', matchedItem = '';
    if (drawing) {
      const hit = (lib.linesByModel.get(m['Model ID']) || []).find(l => l.drawing.toLowerCase().includes(drawing));
      if (!hit) continue;
      matchedDrawing = hit.drawing; matchedItem = hit.description;
    }
    out.push({ model: m, matchedDrawing, matchedItem, lineCount: (lib.linesByModel.get(m['Model ID']) || []).length });
  }
  return out;
};

// ── Turn a model's lines into GCS lines ──
// V1: one flat block. V2: BOM Level relative to the model's minimum level becomes real parent/child lines
// (Excel shows this as indented rows with tree guides). A heading line names the model above its block.
// Quantities are copied as they are (Excel does not scale them); scaling stays automatic (= 1 without a size).
const scmBuildItems = ({ model, lines, version, sheetId, newId, fileName, fromIndex }) => {
  const id = scmText(model['Model ID']);
  const items = [{ id: newId(), type: 'heading', sheetId, parentId: null,
    text: `SCM: ${scmText(model['Model Description']) || id}${model['Rate'] ? ' · ' + scmText(model['Rate']) : ''}${model['Status'] ? ' · ' + scmText(model['Status']) : ''}`,
    scm: { modelId: id, revision: scmText(model['Revision']), status: scmText(model['Status']), file: fileName || scmText(model['File Name']), fromIndex: !!fromIndex } }];
  const levels = lines.map(l => (scmText(l.bomLevel) === '' ? null : Number(l.bomLevel)));
  const minLevel = version >= 2 ? Math.min(...levels.filter(v => v !== null && !isNaN(v))) : 0;
  const stack = []; // [{depth, id}]
  lines.forEach((l, i) => {
    const depth = version >= 2 && levels[i] !== null && isFinite(minLevel) ? Math.max(0, levels[i] - minLevel) : 0;
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const itemId = newId();
    const qty = Number(l.qty);
    items.push({ id: itemId, type: 'item', sheetId, parentId: depth > 0 && stack.length ? stack[stack.length - 1].id : null,
      partNumber: l.sap, description: l.description, drawingNumber: l.drawing, supplier: '', qty: isFinite(qty) && qty > 0 ? qty : 1,
      unitCost: 0, ccy: 'USD', source: '', margin: 0, contingency: 0, tariff: 0, discount: 0, leadTime: 0, imported: false, afrmm: false,
      manualSellPrice: null, notes: l.notes || '', tag: l.tag || '', supplierRef: l.supplierRef || '',
      scm: { modelId: id, line: l.lineNo, bomLevel: levels[i], parentRowId: l.parentRowId || '', qtyInvalid: !(isFinite(qty) && qty > 0) } });
    stack.push({ depth, id: itemId });
  });
  return items;
};

// Insert new lines into the item list: after an anchor line (and all its BOM children), or at the end of a tab.
const scmInsertItems = (items, newItems, { sheetId, afterId, firstSheetId }) => {
  const inSheet = i => (i.sheetId || firstSheetId) === sheetId;
  let at = -1;
  if (afterId) {
    const idx = items.findIndex(i => i.id === afterId);
    if (idx >= 0) {
      const desc = new Set([afterId]);
      at = idx;
      for (let k = idx + 1; k < items.length; k++) { if (items[k].parentId && desc.has(items[k].parentId)) { desc.add(items[k].id); at = k; } else if (items[k].type === 'heading' || !items[k].parentId) break; }
    }
  }
  if (at < 0) { for (let k = items.length - 1; k >= 0; k--) if (inSheet(items[k])) { at = k; break; } }
  const next = items.slice();
  next.splice(at + 1, 0, ...newItems);
  return next;
};

// Latest positive PO/PQ cost (Excel tblLatestCost: latest positive-cost posting for the SAP item).
const scmLatestCost = history => (history || []).filter(h => h.unitCost > 0).sort((a, b) => scmText(b.date).localeCompare(scmText(a.date)))[0] || null;

// ── Folder access (browser File System Access API; handle remembered in IndexedDB) ──
const ScmLibrary = (() => {
  let handle = null, cache = null, cacheStamp = '';
  const supported = () => typeof window !== 'undefined' && !!window.showDirectoryPicker;
  const perm = async (ask) => {
    if (!handle) return false;
    try {
      if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
      if (ask) return (await handle.requestPermission({ mode: 'read' })) === 'granted';
    } catch (e) {}
    return false;
  };
  const entries = async (dir) => { const out = []; for await (const [name, h] of dir.entries()) out.push({ name, h }); return out; };
  const findIndexFile = async () => {
    const top = await entries(handle);
    const f = top.find(e => e.h.kind === 'file' && SCM_INDEX_PATTERN.test(e.name));
    return f ? f.h : null;
  };
  const findModelFile = async (fileName, folderHint) => {
    const want = scmText(fileName).toLowerCase(); if (!want) return null;
    const top = await entries(handle);
    const direct = top.find(e => e.h.kind === 'file' && e.name.toLowerCase() === want);
    if (direct) return direct.h;
    const dirs = top.filter(e => e.h.kind === 'directory');
    const hint = scmText(folderHint).replace(/\/+$/, '').split('/').pop().toLowerCase();
    dirs.sort((a, b) => (b.name.toLowerCase() === hint) - (a.name.toLowerCase() === hint));
    for (const d of dirs) { for (const e of await entries(d.h)) if (e.h.kind === 'file' && e.name.toLowerCase() === want) return e.h; }
    return null;
  };
  const readWorkbook = async fileHandle => { const f = await fileHandle.getFile(); const buf = await f.arrayBuffer(); return { wb: XLSX.read(new Uint8Array(buf), { type: 'array', dense: true }), file: f }; };
  return {
    supported,
    get folderName() { return handle ? handle.name : ''; },
    async restore() { try { handle = await _idb.get(SCM_IDB_KEY_FOLDER); } catch (e) { handle = null; } return handle ? { name: handle.name, granted: await perm(false) } : null; },
    async pick() { handle = await window.showDirectoryPicker({ id: 'gcs-scm', mode: 'read' }); cache = null; cacheStamp = ''; try { await _idb.set(SCM_IDB_KEY_FOLDER, handle); } catch (e) {} return handle.name; },
    async forget() { handle = null; cache = null; cacheStamp = ''; await _idb.del(SCM_IDB_KEY_FOLDER).catch(() => {}); },
    async ensurePermission() { return perm(true); },
    // Load the library from the master index (re-read only when the file changed)
    async loadIndex(force) {
      if (!handle) throw new Error('No SCM folder selected.');
      if (!(await perm(true))) throw new Error('Permission to read the SCM folder was not given.');
      const fh = await findIndexFile();
      if (!fh) throw new Error(`No SCM_Master_Index file in "${handle.name}". Pick the Commercial Costing Program folder (it holds the master index), or scan the SCM folder instead.`);
      const f = await fh.getFile();
      const stamp = f.name + '|' + f.lastModified + '|' + f.size;
      if (!force && cache && cacheStamp === stamp) return cache;
      const t0 = performance.now();
      const { wb } = await readWorkbook(fh);
      cache = { ...scmParseMasterIndex(wb), indexFile: f.name, indexModified: new Date(f.lastModified).toISOString(), loadMs: Math.round(performance.now() - t0) };
      cacheStamp = stamp;
      return cache;
    },
    // Build the library by reading every SCM file in the folder (no master index needed; slower)
    async scanFolder(onProgress) {
      if (!handle) throw new Error('No SCM folder selected.');
      if (!(await perm(true))) throw new Error('Permission to read the SCM folder was not given.');
      const files = [];
      const walk = async (dir, depth, path) => { for (const e of await entries(dir)) {
        if (e.h.kind === 'file' && SCM_FILE_PATTERN.test(e.name) && !e.name.startsWith('~$') && !SCM_INDEX_PATTERN.test(e.name)) files.push({ h: e.h, path });
        else if (e.h.kind === 'directory' && depth < 2) await walk(e.h, depth + 1, path + '/' + e.name); } };
      await walk(handle, 0, handle.name);
      const catalogue = [], linesByModel = new Map(), dataQuality = [];
      const t0 = performance.now();
      for (let i = 0; i < files.length; i++) {
        try {
          const { wb, file } = await readWorkbook(files[i].h);
          const p = scmParseModelFile(wb, file.name);
          const id = scmText(p.info['Model ID']) || file.name.replace(SCM_FILE_PATTERN, '');
          const m = { 'Model ID': id, 'File Name': file.name, 'Folder Path': files[i].path, 'Modified Date': new Date(file.lastModified).toISOString().slice(0, 19).replace('T', ' ') };
          SCM_CATALOGUE_FIELDS.forEach(k => { if (!(k in m) && k in p.info) m[k] = scmText(p.info[k]); });
          catalogue.push(m); linesByModel.set(id, p.lines);
          p.lines.forEach(l => { const q = Number(l.qty); if (!(isFinite(q) && q > 0)) dataQuality.push({ Severity: 'Warning', 'Issue Type': 'Invalid Quantity', 'Model ID': id, 'Model Description': l.description, 'File Name': file.name, Details: `Line ${l.lineNo} has a blank, zero or negative quantity.` }); });
        } catch (e) { dataQuality.push({ Severity: 'Error', 'Issue Type': 'Unreadable file', 'File Name': files[i].h.name, Details: String(e.message || e) }); }
        if (onProgress) onProgress(i + 1, files.length);
      }
      cache = { catalogue, linesByModel, dataQuality, refreshLog: null, source: 'scan', loadMs: Math.round(performance.now() - t0) };
      cacheStamp = 'scan';
      return cache;
    },
    // Open one model's own file (latest edits, V2 fields). Returns null if it is not in the folder.
    async openModel(model) {
      if (!handle || !(await perm(true))) return null;
      const fh = await findModelFile(model['File Name'] || (model['Model ID'] + '.xlsx'), model['Folder Path']);
      if (!fh) return null;
      const { wb, file } = await readWorkbook(fh);
      return { ...scmParseModelFile(wb, file.name), modified: new Date(file.lastModified).toISOString().slice(0, 19).replace('T', ' ') };
    },
    // For tests and browsers without folder access: load a master index from a picked file
    async loadIndexFromFile(file) { const buf = await file.arrayBuffer(); cache = { ...scmParseMasterIndex(XLSX.read(new Uint8Array(buf), { type: 'array', dense: true })), indexFile: file.name, indexModified: new Date(file.lastModified).toISOString(), source: 'file' }; cacheStamp = 'file'; return cache; },
    get cached() { return cache; },
  };
})();
