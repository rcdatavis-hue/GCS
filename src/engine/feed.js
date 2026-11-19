
const LS_KEY_FEED    = (APP_ID+'-feed-name');    // connected filename
const LS_KEY_COLMAPS = (APP_ID+'-fs-colmaps');  // stored column overrides
const IDB_KEY_HANDLE      = (APP_ID+'-file-handle');      // IndexedDB key for feed file handle
const IDB_KEY_SAVE_HANDLE = (APP_ID+'-save-file-handle'); // IndexedDB key for auto-save file handle

// Minimal IndexedDB helpers for storing/retrieving the file handle
// (localStorage can't store non-serialisable objects like FileSystemFileHandle)
const _idb = (() => {
 let _db = null;
 const open = () => new Promise((res, rej) => {
  if (_db) return res(_db);
  const req = indexedDB.open((APP_ID+'-store'), 1);
  req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
  req.onsuccess = e => { _db = e.target.result; res(_db); };
  req.onerror = () => rej(req.error);
 });
 return {
  async get(key) {
   try {
   const db = await open();
   return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => res(req.result ?? null);
    req.onerror = () => rej(req.error);
   });
   } catch(e) { return null; }
  },
  async set(key, value) {
   try {
   const db = await open();
   return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    const req = tx.objectStore('kv').put(value, key);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
   });
   } catch(e) {}
  },
  async del(key) {
   try {
   const db = await open();
   return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    const req = tx.objectStore('kv').delete(key);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
   });
   } catch(e) {}
  },
 };
})();

const FEED_SHEET_DEFS = {
salesQuotes: {
 sheetMatch: ['global sales quotes','global sq data','sales quotes','sales quote'],
 fields: {
 itemNo:       ['item no.','item no','item code','item number','part no','part number'],
 description:  ['item description','description','desc'],
 qty:          ['quantity','qty'],
 drawing:      ['drawing','drawing no','drawing number','dwg'],
 unitPrice:    ['price','unit price','unit price (usd)'],
 rowTotal:     ['row total','line total','total'],
 date:         ['posting date','date','doc date','quote posting date'],
 quoteNo:      ['quote no.','quote no','quote number','docnum'],
 customerName: ['customer name','customer/vendor name','customer','client'],
 country:      ['countrys','country'],
 db:           ['db','location'],
 soNo:         ['sales order no.','so no','so number'],
 }
},
salesOrders: {
 sheetMatch: ['global sales orders','global so data','sales orders','sales order'],
 fields: {
 quoteNo:      ['quote no.','quote no','quote number'],
 soNo:         ['so no.','so no','so number'],
 date:         ['posting date','date'],
 ccy:          ['doc cur','currency','ccy','doc currency'],
 customerCode: ['customer number','customer code','customer no','customer/vendor code'],
 customerName: ['customer','customer name','customer/vendor name'],
 itemNo:       ['item code','item no.','item no','part no','item number'],
 description:  ['item description','description'],
 qty:          ['qty','quantity'],
 unitPrice:    ['unitpw/tdisc($)','unit price','price','unit price (usd)'],
 db:           ['db','location'],
 }
},
purchaseQuotes: {
 sheetMatch: ['global purchase quotes','global pq data','purchase quotes','purchase quote'],
 fields: {
 db:           ['db','location'],
 docNum:       ['docnum','doc num','quote no','purchase quote no.'],
 supplierCode: ['cardcode','supplier code','vendor code','customer/vendor code'],
 supplierName: ['cardname','supplier name','vendor name','customer/vendor name'],
 itemNo:       ['itemcode','item code','item no.','item no','item number'],
 description:  ['dscription','description','desc','item description'],
 qty:          ['pqtreqqty','quantity','qty'],
 unitPrice:    ['unit price','unitprice','price','unit price (usd)'],
 lineTotal:    ['linetotal','line total','total'],
 date:         ['docdate','doc date','posting date','date','quote posting date'],
 leadTime:     ['lead time','lead time (days)','leadtime','delivery days','lead days','vendor lead time'],
 }
},
purchaseOrders: {
 sheetMatch: ['global purchase orders','global po data','purchase orders','purchase order'],
 fields: {
 db:           ['db','location'],
 poNo:         ['po no.','po no','po number','purchase order no.'],
 supplierCode: ['cardcode','supplier code','vendor code','customer/vendor code'],
 supplierName: ['supplier name','vendor name','cardname','customer/vendor name'],
 itemNo:       ['item no.','item no','item code','part no','item number'],
 description:  ['item description','description','desc'],
 drawing:      ['drawing','drawing no','drawing number','dwg'],
 drawingRev:   ['drawing revision','drawing rev','revision','rev'],
 unitPrice:    ['unit price (lc)','unit price','price','unit price (usd)'],
 date:         ['po posting date','posting date','date'],
 qty:          ['quantity','qty'],
 leadTime:     ['lead time','lead time (days)','leadtime','delivery days','lead days','vendor lead time'],
 }
},
eqd: {
 // GCS: Equipment Quotations Database (SharePoint list on CrownSales), added to the feed with the GCS workbook's query
 sheetMatch: ['equipment quotations','eqd','spquotedb'],
 fields: {
 id:             ['id'],
 equipment:      ['equipment name'],
 vendor:         ['vendor'],
 price:          ['price'],
 currency:       ['currency'],
 quoteNo:        ['quote number'],
 vendorUrl:      ['linkvendorurl','link vendor url'],
 quoteDate:      ['quote date'],
 material:       ['material'],
 size:           ['plantrate-diameter','plant rate-diameter'],
 sizeUnits:      ['plantrate(units)','plant rate (units)'],
 segment:        ['segment'],
 category:       ['category'],
 sap:            ['sap'],
 sapDescription: ['sapdescription','sap description'],
 description:    ['description'],
 modelDrawing:   ['model-drawing'],
 refDrawing:     ['reference drawing'],
 modelNo:        ['model #'],
 refDwgPrefix:   ['refdwgprefix'],
 drawingUrl:     ['refdwglink','reference dwg link'],
 bidOffice:      ['bidoffice','bid office'],
 deliveryWks:    ['delivery (wks)'],
 }
},
currency: {
 sheetMatch: ['currency conversion','currency','fx rates','exchange rates'],
 fields: {
 currency:     ['currency'],
 rate:         ['rates (per 1 usd)','rate','rate per usd','per 1 usd'],
 }
},
pricelists: {
 sheetMatch: ['pricelists','pricelist','price list','price lists'],
 fields: {
 itemNo:     ['item number','item no','item no.','part no','part number'],
 ciwCost:    ['ciw cost'],
 eclCost:    ['ecl cost'],
 citCost:    ['cit cost'],
 ciaCost:    ['cia cost'],
 ciwPrice:   ['ciw price'],
 eclPrice:   ['ecl price'],
 citPrice:   ['cit price'],
 ciaPrice:   ['cia price'],
 ciwMargin:  ['ciw margin'],
 eclMargin:  ['ecl margin'],
 citMargin:  ['cit margin'],
 ciaMargin:  ['cia margin'],
 }
},
ncmCodes: {
 sheetMatch: ['ncm codes','ncmcodes','ncm code','ncm'],
 fields: {
 itemNo:      ['item no.','item no','item number','part no','part number'],
 description: ['item description','description'],
 ncm:         ['ncm'],
 ipi:         ['ipi'],
 }
},
ncmIpiLookup: {
 sheetMatch: ['ncmipilookup','ncm ipi lookup','ncm ipi','ipi lookup'],
 fields: {
 ncm: ['ncm ','ncm','ncm code'],
 ipi: ['alíquota (%)','aliquota (%)','alíquota','aliquota','ipi','rate'],
 }
},
taxCodes: {
 sheetMatch: ['tax codes','taxcodes','tax-codes','tax_codes','sap tax','sap tax codes'],
 fields: {
 code:          ['code'],
 name:          ['name'],
 icms:          ['icms'],
 icmsBasis:     ['icms basis','icms basis (%)','icms base','icms base (%)','base icms','icms_basis','icmsbasis','icms br','basis'],
 icmsEffective: ['icms rate (effective)','icms effective','effective rate','icms rate','rate effective'],
 ipi:           ['ipi'],
 pis:           ['pis'],
 cofins:        ['cofins'],
 }
},
businessPartners: {
 sheetMatch: ['global bps','global bp data','global business partners','business partners','bps'],
 fields: {
 cardCode:      ['cardcode','card code','bp code','code'],
 cardName:      ['cardname','card name','bp name','name'],
 group:         ['customer group','group','bp type'],
 currency:      ['currency','ccy'],
 paymentTerms:  ['pymntgroup','payment group','payment terms','pymnt group'],
 country:       ['country'],
 salesPerson:   ['slpname','slp name','sales person','sales rep','salesperson'],
 location:      ['location','db'],
 }
},
};

function detectColIdx(headers, candidates) {
const lc = headers.map(h => (h||'').toString().toLowerCase().trim());
for (const c of candidates) {
 const i = lc.findIndex(h => h === c);
 if (i !== -1) return i;
}
for (const c of candidates) {
 const i = lc.findIndex(h => h.includes(c));
 if (i !== -1) return i;
}
return -1;
}

function buildColMap(headers, fieldDefs) {
const map = {};
for (const [field, candidates] of Object.entries(fieldDefs)) {
 map[field] = detectColIdx(headers, candidates);
}
return map;
}

function mapSheetRow(row, colMap) {
const out = {};
for (const [field, idx] of Object.entries(colMap)) {
 if (idx >= 0 && row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
 out[field] = row[idx];
 }
}
return out;
}

function fmtDate(v) {
if (!v) return '';
if (v instanceof Date) return v.toISOString().slice(0,10);
if (typeof v === 'number') {
 const d = new Date(Math.round((v - 25569) * 86400 * 1000));
 return d.toISOString().slice(0,10);
}
return v.toString().slice(0,10);
}

function parsePrice(v) {
if (v === null || v === undefined || v === '') return 0;
if (v instanceof Date) {
 if (v.getFullYear() < 1980) {
 const serial = Math.round((v.getTime() / 86400000) + 25569);
 return serial > 0 ? serial : 0;
 }
 return 0; // A real date in a price field — shouldn't happen, return 0
}
if (typeof v === 'string' && /^1[89]\d\d-\d\d-\d\d$/.test(v)) {
 const d = new Date(v);
 if (!isNaN(d) && d.getFullYear() < 1980) {
 const serial = Math.round((d.getTime() / 86400000) + 25569);
 return serial > 0 ? serial : 0;
 }
}
return parseFloat(v) || 0;
}

const LocalFileService = (() => {
let _handle   = null;   // single FileSystemFileHandle
let _fileName = null;
const _cache  = {};     // sheetKey → parsed rows
let _wbCache  = null;   // parsed XLSX workbook (invalidated on refresh/reconnect)
let _colMaps  = null;   // overrides stored in localStorage
let _ipiMap   = null;   // Map<ncmCode, ipiRate> for O(1) IPI lookups

function getColMaps() {
 if (_colMaps) return _colMaps;
 try { const s = localStorage.getItem(LS_KEY_COLMAPS); if(s) { _colMaps = JSON.parse(s); return _colMaps; } } catch(e) {}
 return {};
}
function saveColMaps(m) { _colMaps = m; try { localStorage.setItem(LS_KEY_COLMAPS, JSON.stringify(m)); } catch(e) {} }

let _onStaleCallback = null;

async function pingHandle() {
 if (!_handle) return false;
 try {
 if (_handle.queryPermission) {
  const perm = await _handle.queryPermission({mode: 'read'});
  if (perm === 'granted') return true;
  if (perm === 'denied') { _markStale(); return false; }
  _markStale();
  return false;
 }
 await _handle.getFile();
 return true;
 } catch(e) {
 _markStale();
 return false;
 }
}

function _markStale() {

 if (_onStaleCallback) _onStaleCallback(_fileName);
}

async function _requestPermission() {
 if (!_handle) return false;
 try {
 if (_handle.requestPermission) {
  const perm = await _handle.requestPermission({mode: 'read'});
  return perm === 'granted';
 }
 } catch(e) {}
 return false;
}

async function _repickFile() {
 try {
 const opts = {
  types: [{ description: 'Excel Files', accept: {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12': ['.xlsb'],
  'application/vnd.ms-excel': ['.xls'],
  }}],
  multiple: false,
 };
 if (_fileName && window.showOpenFilePicker) {
  opts.suggestedName = _fileName;
 }
 const [handle] = await window.showOpenFilePicker(opts);
 _handle = handle;
 _fileName = handle.name;
 Object.keys(_cache).forEach(k => delete _cache[k]);
 _wbCache = null;
 _ipiMap  = null;
 _bpIndex.customers = null; _bpIndex.suppliers = null; _bpIndex._built = false; _bpDetails.data = null; _bpDetails.data = null; _partIndex.parts = null; _partIndex._built = false;
 try { localStorage.setItem(LS_KEY_FEED, handle.name); } catch(e) {}
 return true;
 } catch(e) {
 if (e.name !== 'AbortError') console.error('[GCS] Re-pick failed:', e);
 return false;
 }
}

let _readInFlight = null;
let _fileLastModified = null; // lastModified timestamp (ms) of the feed file itself

async function readAllSheets(forceRead = false) {
 if (!_handle) return null;
 const XLSXlib = XLSX;
 if (!XLSXlib) { console.error('[GCS] XLSX library not available'); return null; }
 if (_wbCache && !forceRead) return _wbCache;
 if (_readInFlight) return _readInFlight;
 _readInFlight = (async () => {
 try {
  const file = await _handle.getFile();
  _fileLastModified = file.lastModified || null;
  const buf  = await file.arrayBuffer();
  _wbCache = XLSXlib.read(buf, {type:'array'});
  return _wbCache;
 } catch(e) {
   }
 const restored = await _requestPermission();
 if (restored) {
  try {
  const file = await _handle.getFile();
  _fileLastModified = file.lastModified || null;
  const buf  = await file.arrayBuffer();
  _wbCache = XLSXlib.read(buf, {type:'array'});
  return _wbCache;
  } catch(e) {}
 }
 _markStale();
 const repicked = await _repickFile();
 if (repicked) {
  const file = await _handle.getFile();
  _fileLastModified = file.lastModified || null;
  const buf  = await file.arrayBuffer();
  _wbCache = XLSXlib.read(buf, {type:'array'});
  return _wbCache;
 }
 return null;
 })().finally(() => { _readInFlight = null; });
 return _readInFlight;
}

function matchSheet(wb, sheetKey) {
 const def  = FEED_SHEET_DEFS[sheetKey];
 const names = wb.SheetNames.map(n => n.toLowerCase().trim());
 for (const match of def.sheetMatch) {
 const idx = names.findIndex(n => n === match || n.includes(match));
 if (idx !== -1) return wb.SheetNames[idx];
 }
 return null; // sheet not found — caller must handle null
}

async function loadSheet(sheetKey, forceRefresh) {
 if (_cache[sheetKey] && !forceRefresh) return _cache[sheetKey];
 if (!_handle) return null;
 const wb = await readAllSheets();
 if (!wb) return null;
 const sheetName = matchSheet(wb, sheetKey);
 if (!sheetName) return null; // sheet not present in this workbook
 const ws        = wb.Sheets[sheetName];
 const rows      = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
 if (rows.length < 2) return [];
 const headers = rows[0].map(h => (h||'').toString());

 try {
 const hc = JSON.parse(localStorage.getItem((APP_ID+'-fs-headers')) || '{}');
 const prevHeaders = hc[sheetKey];
 const headersChanged = prevHeaders && JSON.stringify(prevHeaders) !== JSON.stringify(headers);
 if (headersChanged) {
  const maps = getColMaps() || {};
  if (maps[sheetKey]) {
  delete maps[sheetKey];
  saveColMaps(maps);
  }
 }
 hc[sheetKey] = headers;
 localStorage.setItem((APP_ID+'-fs-headers'), JSON.stringify(hc));
 } catch(e) {}

 const overrides = (getColMaps() || {})[sheetKey] || {};
 const autoDef   = buildColMap(headers, FEED_SHEET_DEFS[sheetKey].fields);
 const colMap    = {...autoDef, ...overrides};
 const data = rows.slice(1).map(row => mapSheetRow(row, colMap));
 _cache[sheetKey] = data;
 // Free this sheet's raw parsed cell data now that the lightweight row cache
 // exists — SheetJS's per-cell objects (type/style/formula metadata) are far
 // heavier than the plain-object rows we actually use, and matchSheet() only
 // reads wb.SheetNames (not wb.Sheets), so other not-yet-loaded sheets are unaffected.
 delete wb.Sheets[sheetName];
 return data;
}

const _bpIndex = {customers: null, suppliers: null};

// BP details cache — keyed by CardCode, populated from the Global BPs sheet
const _bpDetails = {data: null};

// Map SAP currency codes to PCW currency codes
function normBPCurrency(raw) {
 if (!raw) return null;
 const s = raw.toString().trim();
 const map = {'$':'USD', 'USD':'USD', 'GBP':'GBP', 'EUR':'EUR', 'R$':'BRL', 'BRL':'BRL', 'ARS':'ARS'};
 return map[s] || null; // null for '##' and anything unrecognised
}

async function buildBPDetails() {
 if (_bpDetails.data) return _bpDetails.data;
 const rows = await loadSheet('businessPartners', false);
 if (!rows) { _bpDetails.data = {}; return {}; }
 const map = {};
 for (const r of rows) {
 const code = (r.cardCode || '').toString().trim();
 if (!code) continue;
 map[code] = {
  name:         (r.cardName || '').toString().trim(),
  group:        (r.group || '').toString().trim(),
  currency:     normBPCurrency(r.currency),
  paymentTerms: (r.paymentTerms || '').toString().trim() || null,
  country:      (r.country || '').toString().trim() || null,
  salesPerson:  (r.salesPerson || '').toString().trim() || null,
  location:     (r.location || '').toString().trim() || null,
 };
 }
 _bpDetails.data = map;
 return map;
}

// Returns enrichment fields for a customer CardCode, or null if not found / feed not connected
async function lookupCustomerBP(cardCode) {
 if (!cardCode) return null;
 const map = await buildBPDetails();
 const entry = map[cardCode.toString().trim()];
 if (!entry || entry.group !== 'Customer') return null;
 return entry;
}

// Returns currency for a supplier by name match, or null if not found
async function lookupSupplierBPCurrency(supplierName) {
 if (!supplierName) return null;
 const map = await buildBPDetails();
 const q = supplierName.toString().toLowerCase().trim();
 // Exact match first, then case-insensitive
 for (const [, entry] of Object.entries(map)) {
 if (entry.group === 'Supplier' && entry.name.toLowerCase() === q && entry.currency) {
  return entry.currency;
 }
 }
 return null;
}

const _partIndex = {parts: null, _built: false};

async function buildPartIndex() {
 if (_partIndex._built) return;
 const map = {};
 function updatePart(itemNo, description, supplierName, db, date, drawing) {
  if (!itemNo) return;
  const key = itemNo.toString().trim().toUpperCase();
  if (!key) return;
  const d = fmtDate(date);
  const drawingStr = drawing != null ? drawing.toString().trim() : '';
  if (!map[key]) {
   map[key] = {itemNo: itemNo.toString().trim(), description: description || '', supplier: supplierName || '', drawing: drawingStr, bus: new Set(), latestDate: d};
  } else {
   if (d && (!map[key].latestDate || d > map[key].latestDate)) {
    map[key].description = description || map[key].description;
    map[key].supplier = supplierName || map[key].supplier;
    map[key].drawing  = drawingStr   || map[key].drawing;
    map[key].latestDate = d;
   }
  }
  map[key].bus.add(normDB(db));
 }
 const po = await loadSheet('purchaseOrders', false);
 if (po) { for (const r of po) { updatePart(r.itemNo, r.description, r.supplierName, r.db, r.date, r.drawing); } }
 const pq = await loadSheet('purchaseQuotes', false);
 if (pq) { for (const r of pq) { updatePart(r.itemNo, r.description, r.supplierName, r.db, r.date, r.drawing); } }
 const sq = await loadSheet('salesQuotes', false);
 if (sq) { for (const r of sq) { updatePart(r.itemNo, r.description, r.supplierName, r.db, r.date, r.drawing); } }
 _partIndex.parts = Object.values(map);
 _partIndex._built = true;
}

const _gcsLatestIdx = new WeakMap();
const _gcsEqdIdx = new WeakMap();
function gcsLatestCostIndex(rows, status, docKey) {
 let m = _gcsLatestIdx.get(rows);
 if (m) return m;
 m = new Map(); m.byBu = new Map();
 for (const r of rows) {
  const pn = (r.itemNo || '').toString().toLowerCase().trim();
  if (!pn || !r.unitPrice) continue;
  const unitCost = parsePrice(r.unitPrice);
  if (!(unitCost > 0)) continue;
  const date = fmtDate(r.date) || '';
  const rec = { partNumber: r.itemNo.toString(), unitCost, ccy: 'USD', date, supplier: r.supplierName || '', docNo: (r[docKey] || '').toString(), status, qty: parseFloat(r.qty) || 1, bu: normDB(r.db) };
  const perBu = m.byBu.get(pn) || (m.byBu.set(pn, new Map()), m.byBu.get(pn));
  const cb = perBu.get(rec.bu); if (!cb || cb.date < date) perBu.set(rec.bu, rec);
  const cur = m.get(pn);
  if (cur && cur.date >= date) continue;
  m.set(pn, rec);
 }
 m.byBu.forEach((v, k) => m.byBu.set(k, [...v.values()]));
 _gcsLatestIdx.set(rows, m);
 return m;
}

function normDB(db) {
 if (!db) return '';
 const s = db.toString().trim().toUpperCase();
 if (/^[A-Z]{2,4}$/.test(s)) return s;
 return s.split('_')[0];
}

function dbMatchesBU(db, bu) {
 if (!bu) return true;
 return normDB(db) === bu.toString().toUpperCase();
}

async function buildBPIndex() {
 if (_bpIndex._built) return;
 const customers = {}, suppliers = {};

 function updateBP(map, code, name, db, date) {
 const d = fmtDate(date);
 const key = code.toString();
 if (!map[key]) {
  map[key] = {name: name.toString().trim(), bus: new Set(), latestDate: d};
 } else {
  if (d && (!map[key].latestDate || d > map[key].latestDate)) {
  map[key].name = name.toString().trim();
  map[key].latestDate = d;
  }
  map[key].bus.add(normDB(db));
 }
 map[key].bus.add(normDB(db));
 }

 const so = await loadSheet('salesOrders', false);
 if (so) {
 for (const r of so) {
  if (r.customerCode && r.customerName && r.customerCode.toString().toUpperCase().startsWith('C')) {
  updateBP(customers, r.customerCode, r.customerName, r.db, r.date);
  }
 }
 }
 const po = await loadSheet('purchaseOrders', false);
 if (po) {
 for (const r of po) {
  if (r.supplierCode && r.supplierName && r.supplierCode.toString().toUpperCase().startsWith('S')) {
  updateBP(suppliers, r.supplierCode, r.supplierName, r.db, r.date);
  }
 }
 }
 const pq = await loadSheet('purchaseQuotes', false);
 if (pq) {
 for (const r of pq) {
  if (r.supplierCode && r.supplierName && r.supplierCode.toString().toUpperCase().startsWith('S')) {
  updateBP(suppliers, r.supplierCode, r.supplierName, r.db, r.date);
  }
 }
 }
 _bpIndex.customers = Object.entries(customers).map(([code,v]) => ({code, name:v.name, bus:v.bus}));
 _bpIndex.suppliers = Object.entries(suppliers).map(([code,v]) => ({code, name:v.name, bus:v.bus}));
 _bpIndex._built = true;
}

return {
 async connectFile() {
 if (!window.showOpenFilePicker) {
  alert('File System Access API is not supported in this browser. Please use Chrome or Edge.');
  return false;
 }
 try {
  const [handle] = await window.showOpenFilePicker({
  types: [{ description: 'Excel Files', accept: {
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
   'application/vnd.ms-excel.sheet.binary.macroEnabled.12': ['.xlsb'],
   'application/vnd.ms-excel': ['.xls'],
  }}],
  multiple: false,
  });
  _handle   = handle;
  _fileName = handle.name;
  Object.keys(_cache).forEach(k => delete _cache[k]);
  _wbCache  = null;
  _ipiMap   = null;
  _bpIndex.customers = null;
  _bpIndex.suppliers = null;
  _bpIndex._built = false;
  try { localStorage.setItem(LS_KEY_FEED, handle.name); } catch(e) {}
  // Persist the handle so next session can restore without picker
  _idb.set(IDB_KEY_HANDLE, handle).catch(() => {});
  return handle.name;
 } catch(e) {
  if (e.name !== 'AbortError') console.error('File picker error:', e);
  return false;
 }
 },

 // Attempt to restore a previously used handle without showing the picker.
 // Returns the filename if successful, null if no saved handle or permission denied.
 // If permission is needed, requests it — browser shows a small "Allow?" prompt.
 async restoreHandle() {
 try {
  const handle = await _idb.get(IDB_KEY_HANDLE);
  if (!handle) return null;
  // Check / request read permission
  let perm = 'prompt';
  if (handle.queryPermission) perm = await handle.queryPermission({ mode: 'read' });
  if (perm === 'denied') { await _idb.del(IDB_KEY_HANDLE); return null; }
  if (perm !== 'granted') {
   // 'prompt' — must request; this shows the browser's Allow dialog
   if (handle.requestPermission) {
   const result = await handle.requestPermission({ mode: 'read' });
   if (result !== 'granted') return null;
   } else { return null; }
  }
  // Permission granted — restore the handle
  _handle   = handle;
  _fileName = handle.name;
  Object.keys(_cache).forEach(k => delete _cache[k]);
  _wbCache = null; _ipiMap = null;
  _bpIndex.customers = null; _bpIndex.suppliers = null; _bpIndex._built = false; _bpDetails.data = null;
  try { localStorage.setItem(LS_KEY_FEED, handle.name); } catch(e) {}
  return handle.name;
 } catch(e) {
  return null;
 }
 },

 // Returns true if there is a saved handle in IndexedDB (even if not yet restored)
 async hasSavedHandle() {
 const handle = await _idb.get(IDB_KEY_HANDLE).catch(() => null);
 return !!handle;
 },

 getConnectedName() {
 if (_fileName) return _fileName;
 try { return localStorage.getItem(LS_KEY_FEED) || null; } catch(e) { return null; }
 },

 isConnected() { return !!_handle; },
 getFileLastModified() { return _fileLastModified; },
 bpIndexHealth() {
 if (!_bpIndex._built) return null;
 return {
  customers: _bpIndex.customers ? _bpIndex.customers.length : 0,
  suppliers: _bpIndex.suppliers ? _bpIndex.suppliers.length : 0,
 };
 },
 invalidateBPIndex() {
 _bpIndex.customers = null; _bpIndex.suppliers = null; _bpIndex._built = false; _bpDetails.data = null;
 _partIndex.parts = null; _partIndex._built = false;
 },

 async isHandleValid() { return pingHandle(); },

 onStale(cb) { _onStaleCallback = cb; },

 disconnect() {
 _handle = null; _fileName = null;
 Object.keys(_cache).forEach(k => delete _cache[k]);
 _wbCache = null;
 _ipiMap  = null;
 _bpIndex.customers = null; _bpIndex.suppliers = null; _bpIndex._built = false; _bpDetails.data = null; _bpDetails.data = null; _partIndex.parts = null; _partIndex._built = false;
 try { localStorage.removeItem(LS_KEY_FEED); } catch(e) {}
 _idb.del(IDB_KEY_HANDLE).catch(() => {}); // clear persisted handle
 },

 async refresh(isCIT = false) {
 Object.keys(_cache).forEach(k => delete _cache[k]);
 _wbCache = null; // force re-read of file on next load
 _ipiMap  = null; // rebuild on next lookup
 _bpIndex.customers = null; _bpIndex.suppliers = null; _bpIndex._built = false; _bpDetails.data = null; _bpDetails.data = null; _partIndex.parts = null; _partIndex._built = false;
 const wb = await readAllSheets(true);
 if (!wb) return;
 // Always load core sheets. CIT-only sheets (ncmCodes, ncmIpiLookup, taxCodes)
 // are skipped on connect for non-CIT projects — they'll load on first access.
 const coreSheets = ['salesQuotes','salesOrders','purchaseQuotes','purchaseOrders','currency','pricelists'];
 const citSheets  = ['ncmCodes','ncmIpiLookup','taxCodes'];
 const sheetsToLoad = isCIT ? [...coreSheets, ...citSheets] : coreSheets;
 await Promise.all(sheetsToLoad.map(k => loadSheet(k, true)));
 },

 async getSheetHeaders(sheetKey) {
 try {
  const hc = JSON.parse(localStorage.getItem((APP_ID+'-fs-headers')) || '{}');
  if (hc[sheetKey]) return hc[sheetKey];
 } catch(e) {}
 if (!_handle) return null;
 const wb = await readAllSheets();
 if (!wb) return null;
 const sheetName = matchSheet(wb, sheetKey);
 if (!sheetName) return null;
 const ws = wb.Sheets[sheetName];
 if (!ws) return null; // sheet data already freed by loadSheet(); normally short-circuited above via the pcw-fs-headers cache
 const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:'', range:{s:{r:0,c:0},e:{r:0,c:50}}});
 return (rows[0]||[]).map(h => (h||'').toString());
 },

 getColMap(sheetKey) {
 return (getColMaps()||{})[sheetKey] || null;
 },

 saveColMap(sheetKey, colMap) {
 const maps = getColMaps() || {};
 maps[sheetKey] = colMap;
 saveColMaps(maps);
 delete _cache[sheetKey];
 },

 getSheetKeys() {
 return Object.keys(FEED_SHEET_DEFS);
 },

 async getRates() {
 const data = await loadSheet('currency', false);
 if (!data) return null;
 const rates = {};
 for (const r of data) {
  if (r.currency && r.rate) rates[r.currency.toString().toUpperCase()] = parseFloat(r.rate) || 1;
 }
 return Object.keys(rates).length ? rates : null;
 },

 async searchCustomers(query, bu) {
 await buildBPIndex();
 if (!_bpIndex.customers) return [];
 const q = query.toLowerCase().trim();
 if (!q) return [];
 // Also load BP details for enrichment (non-blocking — use cache if available)
 const bpMap = _bpDetails.data || {};
 const buUp = bu ? bu.toString().toUpperCase() : null;
 const allMatches = _bpIndex.customers
  .filter(r => (r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)));
 const buMatches = buUp ? allMatches.filter(r => r.bus.has(buUp)) : allMatches;
 const buSet = new Set(buMatches.map(r => r.code));
 const crossBu = allMatches.filter(r => !buSet.has(r.code));
 const enrich = r => {
  const bp = bpMap[r.code] || {};
  return {id:r.code, name:r.name, code:r.code, ref:'',
   country: bp.country || '',
   currency: bp.currency || '',
   paymentTerms: bp.paymentTerms || '',
   salesPerson: bp.salesPerson || '',
   contact:'', type:'Customer'};
 };
 return [
  ...buMatches.slice(0, 10).map(r => enrich(r)),
  ...crossBu.slice(0, 4).map(r => ({...enrich(r), crossBu:true})),
 ];
 },

 async searchParts(query, bu) {
 await buildPartIndex();
 if (!_partIndex.parts) return [];
 const q = query.toLowerCase().trim();
 if (!q) return [];
 const buUp = bu ? bu.toString().toUpperCase() : null;
 return _partIndex.parts
  .filter(r => (!buUp || r.bus.has(buUp)) && (
   r.itemNo.toLowerCase().includes(q) ||
   r.description.toLowerCase().includes(q) ||
   (r.drawing && r.drawing.toString().toLowerCase().includes(q))
  ))
  .slice(0, 10);
 },

 async searchBP(query, bu) {
 await buildBPIndex();
 if (!_bpIndex.suppliers) return [];
 const q = query.toLowerCase().trim();
 if (!q) return [];
 const buUp = bu ? bu.toString().toUpperCase() : null;
 return _bpIndex.suppliers
  .filter(r => (!buUp || r.bus.has(buUp)) && (r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)))
  .slice(0, 10)
  .map(r => ({id:r.code, name:r.name, code:r.code, country:'', type:'Supplier'}));
 },

 async lookupPart(partNumber, bu) {
 const pn = partNumber.toString().toLowerCase().trim();
 if (!pn) return null;

 function cleanDwg(v) {
  if (!v) return '';
  const s = v.toString().trim();
  return s.toUpperCase() === 'NONE' ? '' : s;
 }

 async function searchSheets(buFilter) {
  const r = {description:'', drawing:'', supplier:''};
  let found = false;

  const po = await loadSheet('purchaseOrders', false);
  if (po) {
  const matches = po
   .filter(row => (row.itemNo||'').toString().toLowerCase() === pn && dbMatchesBU(row.db, buFilter))
   .sort((a,b) => fmtDate(b.date).localeCompare(fmtDate(a.date)));
  if (matches.length) {
   const m = matches[0];
   r.description = m.description || '';
   r.drawing     = cleanDwg(m.drawing);
   r.supplier    = m.supplierName || '';
   found = true;
  }
  }

  if (!r.description || !r.drawing || !r.supplier) {
  const pq = await loadSheet('purchaseQuotes', false);
  if (pq) {
   const matches = pq
   .filter(row => (row.itemNo||'').toString().toLowerCase() === pn && dbMatchesBU(row.db, buFilter))
   .sort((a,b) => fmtDate(b.date).localeCompare(fmtDate(a.date)));
   if (matches.length) {
   const m = matches[0];
   if (!r.description) r.description = m.description || '';
   if (!r.supplier)    r.supplier    = m.supplierName || '';
   found = true;
   }
  }
  }

  if (!r.description || !r.drawing) {
  const sq = await loadSheet('salesQuotes', false);
  if (sq) {
   const matches = sq
   .filter(row => (row.itemNo||'').toString().toLowerCase() === pn && dbMatchesBU(row.db, buFilter))
   .sort((a,b) => fmtDate(b.date).localeCompare(fmtDate(a.date)));
   if (matches.length) {
   const m = matches[0];
   if (!r.description) r.description = m.description || '';
   if (!r.drawing)     r.drawing     = cleanDwg(m.drawing);
   found = true;
   }
  }
  }

  if (!r.description) {
  const so = await loadSheet('salesOrders', false);
  if (so) {
   const matches = so
   .filter(row => (row.itemNo||'').toString().toLowerCase() === pn && dbMatchesBU(row.db, buFilter))
   .sort((a,b) => fmtDate(b.date).localeCompare(fmtDate(a.date)));
   if (matches.length) {
   const m = matches[0];
   if (!r.description) r.description = m.description || '';
   found = true;
   }
  }
  }

  return found ? r : null;
 }

 let result = await searchSheets(bu);

 if (!result || !result.description || !result.drawing) {
  const allBU = await searchSheets(null);
  if (allBU) {
  if (!result) {
   result = {description: allBU.description, drawing: allBU.drawing, supplier: ''};
  } else {
   if (!result.description) result.description = allBU.description;
   if (!result.drawing)     result.drawing     = allBU.drawing;
  }
  }
 }

 return result ? {partNumber: partNumber.toString(), ...result, unitCost: null, ccy: 'USD'} : null;
 },

 async lookupTaxCode(icms, icmsBasis, ipi, pis, cofins) {
 const rows = await loadSheet('taxCodes', false);
 if (!rows) return null;
 const r = (v) => Math.round((parseFloat(v)||0) * 100) / 100; // round to 2dp
 const target = {
  icms:      r(icms),
  icmsBasis: r(icmsBasis),
  ipi:       r(ipi),
  pis:       r(pis),
  cofins:    r(cofins),
 };
 const sampleRow = rows.find(r => r.code);
 const hasBasisCol     = sampleRow && sampleRow.icmsBasis     !== undefined;
 const hasEffectiveCol = sampleRow && sampleRow.icmsEffective !== undefined;
 const match = rows.find(row => {
  if (!row.code) return false;
  const icmsMatch   = r((row.icms||0)*100)   === target.icms;
  const ipiMatch    = r((row.ipi||0)*100)    === target.ipi;
  const pisMatch    = r((row.pis||0)*100)    === target.pis;
  const cofinsMatch = r((row.cofins||0)*100) === target.cofins;
  let basisMatch;
  if (hasBasisCol) {
  basisMatch = r((row.icmsBasis||0)*100) === target.icmsBasis;
  } else if (hasEffectiveCol && (row.icms||0) > 0) {
  const derivedBasis = r(((row.icmsEffective||0) / (row.icms||1)) * 100);
  basisMatch = derivedBasis === target.icmsBasis;
  } else {
  basisMatch = true; // can't check — skip
  }
  return icmsMatch && basisMatch && ipiMatch && pisMatch && cofinsMatch;
 });
 return match ? { code: match.code.toString(), name: match.name || '' } : null;
 },

 async lookupIPIForNCM(ncmCode) {
 const code = (ncmCode || '').toString().trim();
 if (!code) return null;
 if (!_ipiMap) {
  const rows = await loadSheet('ncmIpiLookup', false);
  if (!rows) return null;
  _ipiMap = new Map();
  for (const r of rows) {
  const k = (r.ncm||'').toString().trim();
  if (!k) continue;
  const raw = r.ipi;
  if (raw === null || raw === undefined || raw === '') continue;
  const str = raw.toString().trim().toUpperCase();
  _ipiMap.set(k, str === 'NT' ? 0 : (isNaN(parseFloat(raw)) ? null : parseFloat(raw)));
  }
 }
 const val = _ipiMap.get(code);
 return val !== undefined ? val : null;
 },

 async lookupNCM(partNumber) {
 const pn = partNumber.toString().toLowerCase().trim();
 if (!pn) return null;
 const rows = await loadSheet('ncmCodes', false);
 if (!rows) return null;
 const row = rows.find(r => (r.itemNo||'').toString().toLowerCase().trim() === pn);
 if (!row) return null;
 const ncm = row.ncm ? row.ncm.toString().trim() : null;
 const ipiRaw = row.ipi;
 const ipi = (ipiRaw !== undefined && ipiRaw !== '' && ipiRaw !== null) ? parseFloat(ipiRaw) : null;
 if (!ncm && ipi === null) return null;
 return { ncm, ipi };
 },

 async lookupPricelist(partNumber, bu) {
 const pn = partNumber.toString().toLowerCase().trim();
 if (!pn || !bu) return null;
 const buUp = bu.toString().toUpperCase();
 const FIELDS = { CIW:{cost:'ciwCost',margin:'ciwMargin'}, ECL:{cost:'eclCost',margin:'eclMargin'}, CIT:{cost:'citCost',margin:'citMargin'}, CIA:{cost:'ciaCost',margin:'ciaMargin'} };
 if (!FIELDS[buUp]) return null;
 const pl = await loadSheet('pricelists', false);
 if (!pl) return null;
 const row = pl.find(r => (r.itemNo||'').toString().toLowerCase().trim() === pn);
 if (!row) return null;
 const readBU = b => {
  const f = FIELDS[b];
  const cost   = row[f.cost]   !== undefined && row[f.cost]   !== '' ? parseFloat(row[f.cost])   : null;
  const margin = row[f.margin] !== undefined && row[f.margin] !== '' ? parseFloat(row[f.margin]) : null;
  return (cost === null && margin === null) ? null : { cost, margin };
 };
 // If the requested BU has no price for this part, fall back through the other
 // BUs in a fixed priority order rather than silently labelling the item
 // "<requested BU> Stock" with a price that doesn't actually exist for that BU.
 const FALLBACK_ORDER = ['CIW','ECL','CIT','CIA'];
 const tryOrder = [buUp, ...FALLBACK_ORDER.filter(b => b !== buUp)];
 for (const b of tryOrder) {
  const found = readBU(b);
  if (found) {
   return { cost: found.cost, margin: found.margin !== null ? parseFloat((found.margin * 100).toFixed(4)) : null, ccy: 'USD', isStock: true, sourceBU: b };
  }
 }
 return { cost: null, margin: null, ccy: 'USD', isStock: true, sourceBU: null };
 },

 async getPriceHistory(partNumber, bu) {
 const pn  = partNumber.toString().toLowerCase().trim();
 const [so, sq] = await Promise.all([
  loadSheet('salesOrders', false),
  loadSheet('salesQuotes', false),
 ]);
 const results = [];
 if (so) {
  for (const r of so) {
  if ((r.itemNo||'').toString().toLowerCase() === pn && r.unitPrice && dbMatchesBU(r.db, bu)) {
   results.push({
   partNumber:  r.itemNo.toString(),
   docNo:       r.soNo ? r.soNo.toString() : (r.quoteNo||'').toString(),
   quoteRef:    r.soNo ? r.soNo.toString() : (r.quoteNo||'').toString(),
   qty:         parseFloat(r.qty) || 1,
   ccy:         (r.ccy||'USD').toString().toUpperCase(),
   sellPrice:   parsePrice(r.unitPrice),
   customer:    r.customerName || '',
   date:        fmtDate(r.date),
   bu:          normDB(r.db),
   source:      'Sales Order',
   });
  }
  }
 }
 if (sq) {
  for (const r of sq) {
  if ((r.itemNo||'').toString().toLowerCase() === pn && r.unitPrice && dbMatchesBU(r.db, bu)) {
   results.push({
   partNumber:  r.itemNo.toString(),
   docNo:       (r.quoteNo||'').toString(),
   quoteRef:    (r.quoteNo||'').toString(),
   qty:         parseFloat(r.qty) || 1,
   ccy:         'USD',
   sellPrice:   parsePrice(r.unitPrice),
   customer:    r.customerName || '',
   date:        fmtDate(r.date),
   bu:          normDB(r.db),
   source:      'Sales Quote',
   });
  }
  }
 }
 return results.sort((a,b) => b.date.localeCompare(a.date)).slice(0, 20);
 },

 // GCS: latest positive-cost PO/PQ per business unit for a part (the Cost Source picker). Newest first.
 async getLatestCostByBU(partNumber) {
 const pn = (partNumber || '').toString().toLowerCase().trim();
 if (!pn) return [];
 const [po, pq] = await Promise.all([loadSheet('purchaseOrders', false), loadSheet('purchaseQuotes', false)]);
 const best = new Map();
 const take = r => { const cur = best.get(r.bu); if (!cur || r.date > cur.date || (r.date === cur.date && r.status === 'Purchase Order' && cur.status !== 'Purchase Order')) best.set(r.bu, r); };
 if (po) (gcsLatestCostIndex(po, 'Purchase Order', 'poNo').byBu.get(pn) || []).forEach(take);
 if (pq) (gcsLatestCostIndex(pq, 'Purchase Quote', 'docNum').byBu.get(pn) || []).forEach(take);
 return [...best.values()].sort((x, y) => y.date.localeCompare(x.date) || x.bu.localeCompare(y.bu));
 },

 // GCS: Liquids quotes from the feed's EQD sheet, normalised (null when the feed has no EQD sheet).
 async getEqd() {
 const rows = await loadSheet('eqd', false);
 if (!rows) return null;
 if (_gcsEqdIdx.has(rows)) return _gcsEqdIdx.get(rows);
 const txt = v => (v === undefined || v === null ? '' : String(v).trim());
 const records = [];
 for (const r of rows) {
  if (txt(r.segment).toLowerCase() !== GCS_EQD_SEGMENT.toLowerCase()) continue;
  const price = parsePrice(r.price);
  if (!txt(r.equipment) || !(price > 0)) continue;
  const sizeRaw = r.size;
  records.push({ id: r.id ?? null, equipment: txt(r.equipment), material: txt(r.material), vendor: txt(r.vendor),
   size: sizeRaw === undefined || sizeRaw === null || sizeRaw === '' ? '' : (isNaN(Number(sizeRaw)) ? txt(sizeRaw) : Number(sizeRaw)), sizeUnits: txt(r.sizeUnits),
   price, ccy: gcsEqdCcy(r.currency), date: fmtDate(r.quoteDate) || '', quoteNo: txt(r.quoteNo), vendorUrl: txt(r.vendorUrl),
   sap: txt(r.sap), description: txt(r.sapDescription) || txt(r.description), drawing: txt(r.modelDrawing) || txt(r.refDrawing) || txt(r.modelNo) || txt(r.refDwgPrefix),
   drawingUrl: txt(r.drawingUrl), bidOffice: normDB(r.bidOffice), category: txt(r.category), deliveryWks: txt(r.deliveryWks) });
 }
 const out = { records, total: rows.length };
 _gcsEqdIdx.set(rows, out);
 return out;
 },

 // GCS scorecard: has this customer bought before (any sales order in any BU)? null when the feed has no SO sheet.
 async customerHasOrders(code, name) {
 const so = await loadSheet('salesOrders', false);
 if (!so) return null;
 const c = (code || '').toString().trim().toLowerCase(), n = (name || '').toString().trim().toLowerCase();
 if (!c && !n) return null;
 return so.some(r => (c && (r.customerCode || '').toString().trim().toLowerCase() === c) || (n && (r.customerName || '').toString().trim().toLowerCase() === n));
 },

 // Tests only: put parsed sheet rows in the cache (no feed file needed).
 __seedSheets(sheets) { Object.assign(_cache, sheets || {}); },

 // GCS: latest positive-cost PO/PQ for a part across every business unit (Excel GCS tblLatestCost).
 // Costs in the feed are normalised to USD. Returns {unitCost, ccy, date, supplier, docNo, status, qty, bu} or null.
 // Indexed once per loaded sheet (WeakMap on the cached rows), so bulk autofill does not rescan the sheets per part.
 async getLatestCost(partNumber) {
 const pn = (partNumber || '').toString().toLowerCase().trim();
 if (!pn) return null;
 const [po, pq] = await Promise.all([loadSheet('purchaseOrders', false), loadSheet('purchaseQuotes', false)]);
 const a = po ? gcsLatestCostIndex(po, 'Purchase Order', 'poNo').get(pn) : null;
 const b = pq ? gcsLatestCostIndex(pq, 'Purchase Quote', 'docNum').get(pn) : null;
 if (!a || !b) return a || b || null;
 return b.date > a.date ? b : a; // same date: the PO wins
 },

 async getCostHistory(partNumber, bu) {
 const pn  = partNumber.toString().toLowerCase().trim();
 const [po, pq] = await Promise.all([
  loadSheet('purchaseOrders', false),
  loadSheet('purchaseQuotes', false),
 ]);
 const results = [];
 if (po) {
  for (const r of po) {
  if ((r.itemNo||'').toString().toLowerCase() === pn && r.unitPrice && dbMatchesBU(r.db, bu)) {
   results.push({
   partNumber: r.itemNo.toString(),
   docNo:      (r.poNo||'').toString(),
   supplier:   r.supplierName || '',
   date:       fmtDate(r.date),
   unitCost:   parsePrice(r.unitPrice),
   ccy:        'USD',
   qty:        parseFloat(r.qty) || 1,
   leadTime:   0,
   status:     'Purchase Order',
   notes:      '',
   bu:         normDB(r.db),
   });
  }
  }
 }
 if (pq) {
  for (const r of pq) {
  if ((r.itemNo||'').toString().toLowerCase() === pn && r.unitPrice && dbMatchesBU(r.db, bu)) {
   results.push({
   partNumber: r.itemNo.toString(),
   docNo:      (r.docNum||'').toString(),
   supplier:   r.supplierName || '',
   date:       fmtDate(r.date),
   unitCost:   parsePrice(r.unitPrice),
   ccy:        'USD',
   qty:        parseFloat(r.qty) || 1,
   leadTime:   0,
   status:     'Purchase Quote',
   notes:      '',
   bu:         normDB(r.db),
   });
  }
  }
 }
 return results.sort((a,b) => b.date.localeCompare(a.date)).slice(0, 20);
 },

 getConnectedNames() {
 const name = this.getConnectedName();
 return name ? {feed: name} : {};
 },
 isConnected(type) { return !!_handle; },
 async connectFile_typed(type) { return this.connectFile(); },
 disconnect_typed(type) { this.disconnect(); },
 async refresh_typed(type, isCIT = false) { return this.refresh(isCIT); },
 async lookupCustomerBP(cardCode) { return lookupCustomerBP(cardCode); },
 async lookupSupplierBPCurrency(name) { return lookupSupplierBPCurrency(name); },
};
})();

const DataService = LocalFileService;