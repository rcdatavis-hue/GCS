
/* ═══ COSTING ENGINE & CONSTANTS (no JSX) ══════════════════════════════════ */
/* Everything below is pure JS — no Babel/JSX needed, no size limit applies. */
/* React components start in the <script type="text/babel"> block below.     */

// ── App identity ── This is the Global Cost Sheet, a standalone fork of the Parts Costing Worksheet
// (forked from PCW v0.8 · 2026-11-17). It develops separately from the PCW. Storage keys, IndexedDB,
// file extension and protocol differ so both apps can run in the same browser without touching each other's data.
// The PCW_ constant names are kept from the fork point; the values are this app's own.
const APP_ID = 'gcs';                       // prefix for every localStorage / IndexedDB key
const APP_NAME = 'Global Cost Sheet';
const APP_SHORT = 'GCS';
const FILE_EXT = '.gcs';                    // saves as .gcs; still opens PCW .pcw files
const FORKED_FROM = 'PCW v0.8 · 2026-11-17';

const PCW_VERSION = 'v0.17';
const PCW_BUILD = '2026-11-19';

const sanitizeHTML = (val) => {
if (val === null || val === undefined) return '';
return String(val)
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#x27;');
};

const sha256 = async (str) => {
const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
};

// Compute a deterministic state hash for approval integrity checking.
// We hash: items costs/margins, grand total, revision — enough to detect tampering.
const computeApprovalHash = async (proj, items, grand, sheets) => {
// GCS: covers everything that sets the price: line cost, quantity, markup level or Custom %, inflation and
// scaling (typed or automatic inputs), the tab each line is on, every tab's markup table / discount /
// provisions / type, the project-level GCS settings, and the total contract value.
const payload = JSON.stringify({
 rev: proj.rev,
 sellCcy: proj.sellCcy,
 grand: Math.round(grand * 100), // cents to avoid float noise
 gcs: { mAndE: proj.mAndE ?? null, sAndA: proj.sAndAExpense ?? null, discount: proj.gcsDiscount ?? null, roundTo: proj.roundTo ?? null,
   plantFeed: proj.plantFeed ?? null, inflationPerMonth: proj.inflationPerMonth ?? null, scalingExponent: proj.scalingExponent ?? null,
   costingDate: proj.costingDate || null, segment: proj.segment || null },
 sheets: (sheets || []).map(s => ({ id: s.id, type: s.type || null, include: !!s.include, markup: s.markup || null, defaultLevel: s.defaultLevel || null,
   discount: s.discount ?? null, provisions: s.provisions || null })),
 items: items
  .filter(i => i.type !== 'heading')
  .map(i => ({ id: i.id, pn: i.partNumber, qty: i.qty, cost: i.unitCost, margin: i.margin, contingency: i.contingency,
    level: i.markupLevel || null, infl: i.inflationPct ?? null, scale: i.scalingFactor ?? null, date: i.costDate || null,
    size: i.sizeCapacity ?? null, sheet: i.sheetId || null, sub: i.subCat || null }))
  .sort((a,b) => a.id.localeCompare(b.id)),
});
return sha256(payload);
};

// Returns 'match' | 'mismatch' | 'pending' given an approval record and current state.
// 'pending' means we haven't computed yet (async).
const checkApprovalIntegrity = async (approval, proj, items, grand, sheets) => {
if (!approval.stateHash) return 'no-hash';
const current = await computeApprovalHash(proj, items, grand, sheets);
return current === approval.stateHash ? 'match' : 'mismatch';
};