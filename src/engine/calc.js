

const conv = (amt,from,to,rates) => from===to ? amt : (amt/(rates[from]||1))*(rates[to]||1);

const applyMargins = (base,{margin=0,contingency=0,dealer=0,discountMitigation=0}) => {
let p=base;
if(margin>0&&margin<100)           p/=(1-margin/100);
if(contingency>0&&contingency<100) p/=(1-contingency/100);
if(dealer>0&&dealer<100)           p/=(1-dealer/100);
if(discountMitigation>0&&discountMitigation<100) p/=(1-discountMitigation/100);
return p;
};

// ── Supplier-tagged inbound freight ──────────────────────────────────────────
// An inbound freight entry can be tagged to one or more suppliers; only items from those
// suppliers then carry the charge (weighted by COGS). `supplierTags` (array) is the current
// field. `supplierTag` (string) is the legacy single-supplier field from older saved files, so
// it is still honoured when `supplierTags` is absent. Empty result = untagged = all suppliers.
const getFreightTags = entry => {
  const raw = Array.isArray(entry?.supplierTags) ? entry.supplierTags : [entry?.supplierTag];
  const seen = new Set();
  return raw.map(t => String(t || '').trim()).filter(t => {
    const k = t.toLowerCase();
    if (!t || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// How a supplier-tagged charge is shared out. Landed cost is per ROOT item, so the charge is weighted by
// what each matching node actually contributes to its root's COGS, and each node's slice is credited to
// its root. A node's contribution is its OWN cost x the quantities of every assembly above it (an
// assembly's totalCOGS is (childSum + ownCost) x qty, so children scale with the parent). Contributions
// therefore add up exactly to the root's totalCOGS, so nothing is counted twice and nothing is lost -
// including a matching child that sits under an assembly with a different (or blank) supplier.
// Exclusions match untagged freight: a root that is pricelist / zero-cost carries none of its subtree
// unless forced in; a pricelist item inside an ordinary assembly doesn't carry any either.
// Shared by the allocation (getAlloc) and the freight warnings so they can never disagree.
// roots = the calc'd tree (each node has totalCOGS, qty, supplier, source, _ch).
const freightTagEligibility = (roots, tags, forceAllocToPricelist, forceAllocToZeroCost) => {
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  const eligibleByTag = {};   // lower-cased tag -> eligible COGS
  const itemCountByTag = {};  // lower-cased tag -> items with that supplier, eligible or not
  tags.forEach(t => { eligibleByTag[t.toLowerCase()] = 0; itemCountByTag[t.toLowerCase()] = 0; });
  const allowZero = !!(forceAllocToZeroCost && forceAllocToZeroCost.freight);
  const skipsFreight = n => (n.source === 'Pricelist' && !forceAllocToPricelist) || (n.totalCOGS === 0 && !allowZero);
  const sliceByNode = new Map(); // node id -> COGS slice (a root's slice is its whole subtree's)
  let total = 0;
  roots.forEach(root => {
    const rootCarries = !skipsFreight(root);
    let rootSlice = 0;
    const visit = (node, ancestorQty) => {
      const kids = node._ch || [];
      const qty = node.qty || 1;
      const sup = (node.supplier || '').trim().toLowerCase();
      if (tagSet.has(sup)) {
        itemCountByTag[sup]++;
        if (rootCarries && !skipsFreight(node)) {
          const own = (node.totalCOGS - qty * kids.reduce((s, c) => s + c.totalCOGS, 0)) * ancestorQty;
          if (own > 1e-9) {
            sliceByNode.set(node.id, own);
            rootSlice += own;
            eligibleByTag[sup] += own;
            total += own;
          }
        }
      }
      kids.forEach(c => visit(c, ancestorQty * qty));
    };
    visit(root, 1);
    if (rootSlice > 0) sliceByNode.set(root.id, rootSlice);
  });
  return { tagSet, total, eligibleByTag, itemCountByTag, sliceByNode };
};

// ── "<BU> Stock" supplier label for pricelist parts ──────────────────────────────
// A part found on the pricelist is a stock item, so auto-fill labels its supplier "<BU> Stock" (BU = the one
// the price actually came from, which may be a fallback BU). Like every other auto-filled field this may only
// write over a supplier that is blank or was itself auto-filled - a supplier the user typed is never
// overwritten. Returns the fields to merge into the item's update, or null to leave the supplier alone.
// mayWriteOverride lets a caller with its own overwrite rule (bulk refresh's skipManual) supply the decision.
const stockSupplierUpdate = (plEntry, item, projBU, mayWriteOverride) => {
  if (!plEntry || !plEntry.isStock) return null;
  const mayWrite = mayWriteOverride !== undefined ? mayWriteOverride : (!item.supplier || item._autoSupplier === true);
  return mayWrite ? { supplier: (plEntry.sourceBU || projBU) + ' Stock', _autoSupplier: true } : null;
};

const fc  = (n,dp=2) => Number(n||0).toLocaleString("en-US",{minimumFractionDigits:dp,maximumFractionDigits:dp});
const fp  = n => Number(n||0).toFixed(2)+"%";

const addDays = (dateStr,n) => {
const d=new Date(dateStr||Date.now());
d.setDate(d.getDate()+(parseInt(n)||0));
return d.toISOString().slice(0,10);
};


const calcSiscomex = (numImportedItems) => {
if (numImportedItems === 0) return 0;

const BASE_DI = 185.00; // Base declaration fee
let total = BASE_DI;

for (let i = 1; i <= numImportedItems; i++) {
 if (i === 1) {
 total += 29.50;
 } else if (i >= 2 && i <= 3) {
 total += 23.60;
 } else if (i >= 4 && i <= 10) {
 total += 17.70;
 } else if (i >= 11 && i <= 20) {
 total += 11.80;
 } else if (i >= 21 && i <= 50) {
 total += 5.90;
 } else { // 51+
 total += 2.95;
 }
}

return total;
};

const calcImportTax = (cogsBRL, customsCharges=9, ii=0) => {
const customs = cogsBRL * (customsCharges / 100);
const iiAmt = cogsBRL * (ii / 100);
return {
 customs,
 ii: iiAmt,
 total: customs + iiAmt
};
};

const calcSalesTax = (sellPriceBRL, tc={}) => {

const cfg = {...BR_DEFAULTS, ...tc};
const ipi_r    = (cfg.ipi    || 0) / 100;
const pis_r    = (cfg.pis    || 0) / 100;
const cofins_r = (cfg.cofins || 0) / 100;
const icms_f   = ((cfg.icms || 0) / 100) * ((cfg.icmsBase || 100) / 100);

const x     = 1 / (1 + ipi_r);                                 // 1/(1+IPI)
const denom = (x - icms_f) * (1 - pis_r - cofins_r);
if (denom <= 0) return { ipi: 0, pis: 0, cofins: 0, icms: 0, total: 0 };

const gross  = sellPriceBRL / denom;                            // grossPrice = net * markup
const B      = gross / (1 + ipi_r);                            // ex-IPI base
const TB     = B - gross * icms_f;                             // PIS/COFINS base

const ipi    = B  * ipi_r;
const pis    = TB * pis_r;
const cofins = TB * cofins_r;
const icms   = gross * icms_f;

return {
 ipi,
 pis,
 cofins,
 icms,
 total: ipi + pis + cofins + icms
};
};

const buildTree = flat => {
const map={};
flat.filter(i=>i.type!=="heading").forEach(i=>(map[i.id]={...i,_ch:[]}));
const roots=[];
flat.filter(i=>i.type!=="heading").forEach(i=>{
 if(i.parentId&&map[i.parentId]) map[i.parentId]._ch.push(map[i.id]);
 else roots.push(map[i.id]);
});
return roots;
};

const calcNode = (n, rates, sellCcy, opts={}) => {
const cv = (a,c) => conv(a, c||"USD", sellCcy, rates);

// GCS: a line's unit cost is scaled and inflated (Excel: cost_USD × scaling × (1 + inflation)).
const costFactor = gcsCostFactor(n, opts.proj);
if (!n._ch.length) {
 const unitC = cv(n.unitCost||0, n.ccy) * costFactor;
 const totalCOGS = unitC * (n.qty||1);
 const importedSubCount = 0;
 const afrmmSubCount = 0;
 // Leaf node: critical path = its own lead time (supplier delivery time)
 const criticalPathDays = n.leadTimeOverride ?? (n.leadTime||0);
 return { ...n, _ch: [], unitC, totalCOGS, importedSubCount, afrmmSubCount, criticalPathDays, costFactor };
}

const children = n._ch.map(c => calcNode(c, rates, sellCcy, opts));
const ownC = cv(n.unitCost||0, n.ccy) * costFactor;
const childSum = children.reduce((s,c) => s + c.totalCOGS, 0);
const totalCOGS = (childSum + ownC) * (n.qty||1);

const importedSubCount = children.reduce((s,c) =>
 s + (c.importedSubCount||0) + (c.imported ? 1 : 0), 0);
const afrmmSubCount = children.reduce((s,c) =>
 s + (c.afrmmSubCount||0) + (c.afrmm ? 1 : 0), 0);

// Parent critical path: children procured in parallel → max child path,
// then add own fabrication/assembly time (leadTime on the parent node).
// leadTimeOverride lets the user manually specify the total if the parallel
// assumption doesn't hold for a particular assembly.
const longestChildPath = Math.max(0, ...children.map(c => c.criticalPathDays||0));
const criticalPathDays = n.leadTimeOverride != null
 ? n.leadTimeOverride
 : longestChildPath + (n.leadTime||0);

return {
 ...n, _ch: children,
 unitC: totalCOGS / (n.qty||1),
 totalCOGS,
 importedSubCount,
 afrmmSubCount,
 criticalPathDays,
 costFactor,
};
};


// ── Customer-based default Discount Mitigation ──
// Customers whose name starts with a listed prefix get a default Discount Mitigation %
// when the customer is entered/selected. Applied only on a non-match -> match change of
// the customer name, and only if mitigation is still 0, so manual edits and loaded files
// are never overridden. If the name later stops matching and the value is still the
// auto-applied one, it is reset to 0.
const CUST_DISC_MIT_RULES = [{ prefix: 'adm', pct: 3 }, { prefix: 'sojaprotein', pct: 3 }];
const customerMitigationDefault = (name) => {
  const n = (name || '').trim().toLowerCase();
  const r = CUST_DISC_MIT_RULES.find(r => n.startsWith(r.prefix));
  return r ? r.pct : null;
};
const applyCustomerMitigation = (prev, next) => {
  if (!prev || !next || next.locked) return next;
  const pn = prev.customer && prev.customer.name, nn = next.customer && next.customer.name;
  if (pn === nn) return next;
  const pct = customerMitigationDefault(nn);
  const wasPct = customerMitigationDefault(pn);
  const cur = Number(next.discountMitigation) || 0;
  if (pct != null && wasPct == null && cur === 0) return { ...next, discountMitigation: pct, _discMitAuto: pct };
  if (pct == null && prev._discMitAuto != null) {
    return { ...next, discountMitigation: cur === prev._discMitAuto ? 0 : next.discountMitigation, _discMitAuto: undefined };
  }
  return next;
};