

// ═══ SHARED PRICING ENGINE (no React) ═══════════════════════════════════════
// Freight allocation, landed cost, Brazil import/sales tax, outbound freight, packing & crating,
// sell prices and project totals. Pure functions of their inputs: no React, no DOM, no globals
// beyond the calc helpers above (conv, applyMargins, calcSiscomex, calcImportTax, calcSalesTax,
// calcICMSRate, freightTagEligibility, getFreightTags, getConfidence, BR_DEFAULTS).
// Called through usePricingEngine / useSalesTaxEngine (thin useMemo wrappers). Carried over from the PCW at the
// fork point; from here it develops separately, and PCW fixes are not picked up automatically.
//
// Arithmetic order is kept exactly as it was in the hooks so results are bit-identical.
// Per-node results (getAlloc, getItemSP) are cached by node object: each compute runs once per
// input change, and a tree node object never changes, so the cache cannot go stale. A caller that
// passes a copy of a node ({...n}) simply misses the cache and gets a fresh, identical result.

const computePricing = ({ tree, items, frt, proj, brazilTaxes, brazilStates, isCIT,
  forceAllocToPricelist, forceAllocToZeroCost, distributeOutboundFreight, distributePackingCrating, sheets }) => {
  const toSC = (amt, ccy) => conv(amt, ccy, proj.sellCcy, proj.rates);
  // GCS: margin comes from the line's markup level in its tab's markup table (or a Custom %); no contingency.
  const sheetIdx = gcsSheetIndex(sheets);
  const marginOf = n => gcsMarkupPct(n, sheetIdx.settingsOf(n));
  // GCS: a line has its markup when it uses a level (PASS = 0% is a deliberate choice) or a Custom % above 0, or a manual sell price.
  const hasMarkupOf = n => n.manualSellPrice > 0 || marginOf(n) > 0 || gcsLevelOf(n, sheetIdx.settingsOf(n)) !== GCS_CUSTOM_LEVEL;

  const topCOGS = tree.reduce((s, n) => s + n.totalCOGS, 0);
  const totalInbFrt = frt.inbound.reduce((s, e) => s + toSC(e.cost || 0, e.ccy || "USD"), 0);
  const inboundEntries = frt.inbound || [];

  // ── Brazil: Siscomex and AFRMM project totals ──
  const siscomex = (() => {
    if (!isCIT) return { numImported: 0, totalBRL: 0, totalSC: 0 };
    const numImported = items.filter(i => i.type !== "heading" && i.imported).length;
    if (proj.siscomexOverride !== null && proj.siscomexOverride !== undefined && proj.siscomexOverride >= 0) {
      return { numImported, totalBRL: proj.siscomexOverride, totalSC: conv(proj.siscomexOverride, "BRL", proj.sellCcy, proj.rates) };
    }
    const totalBRL = calcSiscomex(numImported);
    return { numImported, totalBRL, totalSC: conv(totalBRL, "BRL", proj.sellCcy, proj.rates) };
  })();
  const afrmm = (() => {
    if (!isCIT) return { applicableFreight: 0, totalAFRMM: 0, totalAFRMMSC: 0 };
    const applicableFreightBRL = frt.inbound.filter(e => e.afrmm)
      .reduce((s, e) => s + conv(e.cost || 0, e.ccy || "USD", "BRL", proj.rates), 0);
    const afrmmRate = proj.afrmmRate || 8;
    const totalAFRMMBRL = applicableFreightBRL * (afrmmRate / 100);
    return { applicableFreight: applicableFreightBRL, totalAFRMM: totalAFRMMBRL, totalAFRMMSC: conv(totalAFRMMBRL, "BRL", proj.sellCcy, proj.rates) };
  })();

  // ── Outbound freight (cost → sell, margin or markup mode) ──
  const outEntries = frt.outbound.map(e => {
    const cSC = toSC(e.cost || 0, e.ccy || "USD");
    const isMarkup = e.marginMode === "markup";
    const sSC = isMarkup ? cSC * (1 + (e.margin || 0) / 100)
      : (e.margin || 0) < 100 ? cSC / (1 - (e.margin || 0) / 100) : cSC;
    return { ...e, costSC: cSC, sellSC: sSC };
  });
  const totalOutSP = outEntries.reduce((s, e) => s + e.sellSC, 0);
  const totalOutCost = outEntries.reduce((s, e) => s + e.costSC, 0);
  const totalOutMargin = totalOutSP - totalOutCost;

  // ── Allocation bases (which root lines carry freight / Siscomex / AFRMM) ──
  const skipPL = n => n.source === "Pricelist" && !forceAllocToPricelist;
  const hasImp = n => n.imported || (n.importedSubCount || 0) > 0;
  const hasAfr = n => n.afrmm || (n.afrmmSubCount || 0) > 0;
  const eligibleCOGS = tree.reduce((s, n) => {
    if (skipPL(n)) return s;
    if (n.totalCOGS === 0 && !forceAllocToZeroCost.freight) return s;
    return s + n.totalCOGS;
  }, 0);
  const afrmmCOGS = tree.reduce((s, n) => {
    if (!hasAfr(n)) return s;
    if (skipPL(n)) return s;
    if (n.totalCOGS === 0 && !forceAllocToZeroCost.afrmm) return s;
    return s + n.totalCOGS;
  }, 0);
  const eligibleFreightCount = tree.reduce((c, n) => {
    if (skipPL(n)) return c;
    if (n.totalCOGS === 0 && !forceAllocToZeroCost.freight) return c;
    return c + 1;
  }, 0);
  const eligibleSiscomexCount = tree.reduce((c, n) => {
    if (!hasImp(n)) return c;
    if (skipPL(n)) return c;
    if (n.totalCOGS === 0 && !forceAllocToZeroCost.siscomex) return c;
    return c + 1;
  }, 0);
  const eligibleAfrmmCount = tree.reduce((c, n) => {
    if (!hasAfr(n)) return c;
    if (skipPL(n)) return c;
    if (n.totalCOGS === 0 && !forceAllocToZeroCost.afrmm) return c;
    return c + 1;
  }, 0);

  const flattenChildren = node => {
    const result = [];
    const walk = n => { n._ch && n._ch.forEach(c => { result.push(c); walk(c); }); };
    walk(node);
    return result;
  };

  // Supplier-tagged inbound freight eligibility, computed once. Feeds both the allocation (getAlloc)
  // and the freight warnings, so they always agree. Walks the BOM per root (see freightTagEligibility).
  const freightTagInfo = new Map();
  inboundEntries.forEach(entry => {
    const tags = getFreightTags(entry);
    if (!tags.length) return;
    freightTagInfo.set(entry.id, { tags, ...freightTagEligibility(tree, tags, forceAllocToPricelist, forceAllocToZeroCost) });
  });
  const freightTagStatus = new Map();
  inboundEntries.forEach(entry => {
    const info = freightTagInfo.get(entry.id);
    if (!info) return;
    const costSC = toSC(entry.cost || 0, entry.ccy || "USD");
    const problems = info.tags.filter(t => !(info.eligibleByTag[t.toLowerCase()] > 0))
      .map(t => ({ tag: t, hasItems: info.itemCountByTag[t.toLowerCase()] > 0 }));
    freightTagStatus.set(entry.id, { tags: info.tags, costSC, allocated: info.total > 0, problems });
  });
  // Per-entry values used for every line: worked out once, not once per line.
  const inboundPrepared = inboundEntries.map(entry => ({
    entry, tags: getFreightTags(entry), costSC: toSC(entry.cost || 0, entry.ccy || "USD"),
  }));

  // ── Landed cost of one node: COGS + inbound freight + Siscomex + AFRMM + import tax + tariff ──
  const allocCache = new WeakMap();
  const computeAlloc = n => {
    const isPL = n.source === "Pricelist";
    const isZeroCost = n.totalCOGS === 0;
    const skipAlloc = isPL && !forceAllocToPricelist;
    let fr = 0;
    if (!skipAlloc) {
      if (isZeroCost && !forceAllocToZeroCost.freight) {
        fr = 0;
      } else {
        inboundPrepared.forEach(({ entry, tags, costSC: entryCostSC }) => {
          if (!entryCostSC) return;
          if (tags.length) {
            // Tagged entry: only items from the tagged supplier(s) carry it, weighted by COGS across all of them
            const tagInfo = freightTagInfo.get(entry.id);
            const tagSlice = tagInfo && tagInfo.total > 0 ? (tagInfo.sliceByNode.get(n.id) || 0) : 0;
            if (tagSlice > 0) fr += (tagSlice / tagInfo.total) * entryCostSC;
          } else {
            // Untagged entry: allocate across all eligible items
            if (eligibleCOGS > 0) fr += (n.totalCOGS / eligibleCOGS) * entryCostSC;
            else if (eligibleFreightCount > 0) fr += entryCostSC / eligibleFreightCount;
          }
        });
      }
    }
    let siscomexAlloc = 0;
    if (!skipAlloc && isCIT && hasImp(n)) {
      if (isZeroCost && !forceAllocToZeroCost.siscomex) siscomexAlloc = 0;
      // Siscomex allocated equally per unique imported item, not by value
      else if (eligibleSiscomexCount > 0) siscomexAlloc = (siscomex.totalSC || 0) / eligibleSiscomexCount;
    }
    let afrmAlloc = 0;
    if (!skipAlloc && isCIT && hasAfr(n)) {
      if (isZeroCost && !forceAllocToZeroCost.afrmm) afrmAlloc = 0;
      else if (afrmmCOGS > 0) afrmAlloc = (n.totalCOGS / afrmmCOGS) * (afrmm.totalAFRMMSC || 0);
      else if (eligibleAfrmmCount > 0) afrmAlloc = (afrmm.totalAFRMMSC || 0) / eligibleAfrmmCount;
    }
    const cif = n.totalCOGS + fr;
    const tar = n.totalCOGS * ((n.tariff || 0) / 100);
    const allDescendants = flattenChildren(n);
    const importedDescendants = allDescendants.filter(c => c.imported);
    const afrmmDescendants = allDescendants.filter(c => c.afrmm);
    const totalImportedCOGSUnder = importedDescendants.reduce((s, c) => s + c.totalCOGS, 0);
    const totalAfrmmCOGSUnder = afrmmDescendants.reduce((s, c) => s + c.totalCOGS, 0);
    const importedChildrenWithCIF = importedDescendants.map(c => {
      const childSiscomex = siscomexAlloc > 0 && totalImportedCOGSUnder > 0 ? (c.totalCOGS / totalImportedCOGSUnder) * siscomexAlloc : 0;
      const childAFRMM = c.afrmm && afrmAlloc > 0 && totalAfrmmCOGSUnder > 0 ? (c.totalCOGS / totalAfrmmCOGSUnder) * afrmAlloc : 0;
      return { ...c, childSiscomex, childAFRMM, cifForTax: c.totalCOGS + childSiscomex + childAFRMM };
    });
    let importTax = 0;
    if (!skipAlloc && isCIT) {
      if (n.imported) {
        const cifBRL = conv(cif, proj.sellCcy, "BRL", proj.rates);
        const tc = brazilTaxes[n.id] || {};
        const br = calcImportTax(cifBRL, n.customsCharges ?? proj.customsCharges ?? 9, tc.ii ?? 20);
        importTax += conv(br.total, "BRL", proj.sellCcy, proj.rates);
      }
      importedChildrenWithCIF.forEach(c => {
        const cifBRL = conv(c.cifForTax, proj.sellCcy, "BRL", proj.rates);
        const tc = brazilTaxes[c.id] || {};
        const br = calcImportTax(cifBRL, c.customsCharges ?? proj.customsCharges ?? 9, tc.ii ?? 20);
        importTax += conv(br.total, "BRL", proj.sellCcy, proj.rates);
      });
    }
    return {
      fr, siscomex: siscomexAlloc, afrmm: afrmAlloc, cif, tax: importTax, tar,
      landed: n.totalCOGS + fr + siscomexAlloc + afrmAlloc + importTax + tar,
      importedChildren: isCIT ? importedChildrenWithCIF : [],
    };
  };
  const getAlloc = n => {
    let a = allocCache.get(n);
    if (!a) { a = computeAlloc(n); allocCache.set(n, a); }
    return a;
  };
  const allocMap = new Map();
  const visitAll = (fn) => { const v = n => { fn(n); (n._ch || []).forEach(v); }; tree.forEach(v); };
  visitAll(n => allocMap.set(n.id, getAlloc(n)));

  // Base sell price of a root line (before outbound freight / P&C distribution and discount)
  const baseLineSP = item => {
    if (item.manualSellPrice !== null && item.manualSellPrice !== undefined) return item.manualSellPrice * (item.qty || 1);
    const a = getAlloc(item);
    return applyMargins(a.landed, { margin: marginOf(item), contingency: 0,
      dealer: proj.defaultDealer || 0, discountMitigation: proj.discountMitigation || 0 });
  };

  const outboundFreightAllocations = (() => {
    if (!distributeOutboundFreight || totalOutSP === 0 || tree.length === 0) return {};
    let totalBaseSP = 0;
    const baseSPs = {};
    tree.forEach(item => { const b = baseLineSP(item); baseSPs[item.id] = b; totalBaseSP += b; });
    if (totalBaseSP === 0) return {};
    const allocations = {};
    tree.forEach(item => { allocations[item.id] = (baseSPs[item.id] / totalBaseSP) * totalOutSP; });
    return allocations;
  })();

  // ── Packing & Crating ──
  const pc = frt.packingCrating || {};
  // GCS: packing & crating removed; the per-tab FCA/Packing provision replaces it (computeGcsSummary).
  const pcActive = false;
  // pcBaseSPs: item base sell prices (pre-outbound-freight, pre-discount) for the % calculation
  const pcBaseSPs = (() => {
    const map = {};
    let total = 0;
    tree.forEach(item => { const b = baseLineSP(item); map[item.id] = b; total += b; });
    return { map, total };
  })();
  const pcTotal = (() => {
    if (!pcActive) return 0;
    const pcMode = pc.mode || "pct";
    if (pcMode === "cost") {
      const costSC = toSC(parseFloat(pc.cost) || 0, pc.costCcy || "USD");
      const margin = pc.margin || 0;
      const isMarkup = pc.marginMode === "markup";
      return isMarkup ? costSC * (1 + margin / 100) : margin > 0 && margin < 100 ? costSC / (1 - margin / 100) : costSC;
    }
    if (pcMode === "fixed") return parseFloat(pc.overrideAmt) || 0;
    return pcBaseSPs.total * ((pc.pct || 0) / 100); // % of total base sell price (pre-discount)
  })();
  const packingCratingAllocations = (() => {
    if (!pcActive || !distributePackingCrating || pcTotal === 0 || pcBaseSPs.total === 0) return {};
    const allocs = {};
    tree.forEach(item => { allocs[item.id] = (pcBaseSPs.map[item.id] / pcBaseSPs.total) * pcTotal; });
    return allocs;
  })();

  // ── Sell prices ──
  const spCache = new WeakMap();
  const computeItemSP = n => {
    let baseSP;
    if (n.manualSellPrice !== null && n.manualSellPrice !== undefined) {
      baseSP = n.manualSellPrice;
    } else {
      const a = getAlloc(n);
      const totalSP = applyMargins(a.landed, { margin: marginOf(n), contingency: 0,
        dealer: proj.defaultDealer || 0, discountMitigation: proj.discountMitigation || 0 });
      baseSP = totalSP / (n.qty || 1);
    }
    if (distributeOutboundFreight && outboundFreightAllocations[n.id]) baseSP += outboundFreightAllocations[n.id] / (n.qty || 1);
    if (pcActive && (distributeOutboundFreight || distributePackingCrating) && packingCratingAllocations[n.id]) {
      baseSP += packingCratingAllocations[n.id] / (n.qty || 1);
    }
    return baseSP;
  };
  const getItemSP = n => {
    let v = spCache.get(n);
    if (v === undefined) { v = computeItemSP(n); spCache.set(n, v); }
    return v;
  };
  const getItemNetPrice = n => getItemSP(n) * (n.qty || 1) * (1 - (n.discount || 0) / 100);
  const getItemSPWithSalesTax = n => {
    const sp = getItemSP(n);
    if (!isCIT) return sp;
    const discountedSP = sp * (1 - (n.discount || 0) / 100);
    const spBRL = conv(discountedSP, proj.sellCcy, "BRL", proj.rates);
    const icmsRate = calcICMSRate(brazilStates.origin, brazilStates.destination);
    const tc = { ...BR_DEFAULTS, icms: icmsRate, ...(brazilTaxes[n.id] || {}) };
    const salesTax = calcSalesTax(spBRL, tc);
    return discountedSP + conv(salesTax.total, "BRL", proj.sellCcy, proj.rates);
  };

  // Pre-computed per-row maps (O(1) lookup per row)
  const spMap = new Map();
  visitAll(n => spMap.set(n.id, getItemSP(n)));
  const netPriceMap = new Map();
  visitAll(n => { const sp = spMap.get(n.id) ?? 0; netPriceMap.set(n.id, sp * (n.qty || 1) * (1 - (n.discount || 0) / 100)); });
  const spTaxMap = new Map();
  if (isCIT) visitAll(n => spTaxMap.set(n.id, getItemSPWithSalesTax(n)));

  // Quote-ready flags (drive the row completion colours)
  const quoteReadyMap = new Map();
  const nodeReady = n => {
    if (!n._ch || n._ch.length === 0) return !!(n.partNumber?.trim() && n.description?.trim() && n.supplier?.trim() && n.unitCost > 0);
    return !!(n.partNumber?.trim() && n.description?.trim()) && n._ch.every(c => nodeReady(c));
  };
  visitAll(n => {
    const isParent = n._ch && n._ch.length > 0;
    const ready = isParent
      ? !!(n.partNumber?.trim() && n.description?.trim() && hasMarkupOf(n)) && n._ch.every(c => nodeReady(c))
      : !!(n.partNumber?.trim() && n.description?.trim() && n.supplier?.trim() && n.unitCost > 0 && hasMarkupOf(n));
    quoteReadyMap.set(n.id, ready);
  });

  // Margin % that gives a target unit sell price (exact inverse of applyMargins)
  const calculateReverseMargin = (n, targetSellPrice) => {
    const a = getAlloc(n);
    const landed = a.landed / (n.qty || 1);
    if (landed === 0) return 0;
    const contingency = 0; // GCS: no contingency (replaced by inflation and scaling factors)
    const dealer = proj.defaultDealer || 0;
    const discountMitig = proj.discountMitigation || 0;
    let backedOutSP = targetSellPrice;
    if (discountMitig > 0 && discountMitig < 100) backedOutSP *= 1 - discountMitig / 100;
    if (dealer > 0 && dealer < 100) backedOutSP *= 1 - dealer / 100;
    if (contingency > 0 && contingency < 100) backedOutSP *= 1 - contingency / 100;
    if (backedOutSP === 0) return 0;
    return (1 - landed / backedOutSP) * 100;
  };

  // ── Project totals ──
  const landedCOGS = tree.reduce((s, n) => s + (allocMap.get(n.id)?.landed ?? 0), 0);
  const itemsSP = tree.reduce((s, n) => s + getItemNetPrice(n), 0);
  const grand = itemsSP + (distributeOutboundFreight ? 0 : totalOutSP)
    + (distributeOutboundFreight || distributePackingCrating ? 0 : pcTotal);
  const itemsSPWithTax = !isCIT ? itemsSP : tree.reduce((s, n) => s + getItemSPWithSalesTax(n) * (n.qty || 1), 0);
  const freightTaxSC = (() => {
    if (!isCIT || totalOutSP === 0 || distributeOutboundFreight) return 0;
    const outFreightBRL = conv(totalOutSP, proj.sellCcy, "BRL", proj.rates);
    const freightSalesTax = calcSalesTax(outFreightBRL, BR_DEFAULTS);
    return conv(freightSalesTax.total, "BRL", proj.sellCcy, proj.rates);
  })();
  const totalOutSPWithTax = (!isCIT || totalOutSP === 0 || distributeOutboundFreight) ? 0 : totalOutSP + freightTaxSC;
  const grandWithTax = isCIT ? itemsSPWithTax + totalOutSPWithTax : grand;

  return {
    topCOGS, totalInbFrt, freightTagStatus, siscomex, afrmm, outEntries, totalOutSP, totalOutCost, totalOutMargin,
    marginOf, hasMarkupOf, getAlloc, allocMap, spMap, netPriceMap, spTaxMap, quoteReadyMap, getItemSP, getItemNetPrice, getItemSPWithSalesTax,
    calculateReverseMargin, landedCOGS, itemsSP, grand, itemsSPWithTax, totalOutSPWithTax, grandWithTax, freightTaxSC,
    outboundFreightAllocations, packingCratingAllocations, pcActive, pcTotal, pcBaseSPs, distributeOutboundFreight,
  };
};

// Brazil sales tax, import tax detail, discounts and margin breakdowns. Takes the computePricing result.
const computeSalesTax = ({ tree, items, proj, brazilTaxes, brazilStates, isCIT, pricing, distributeOutboundFreight }) => {
  const { getItemSP, getItemNetPrice, getAlloc, landedCOGS, itemsSP, totalOutSP, freightTaxSC } = pricing;
  const itemById = new Map();
  items.forEach(i => { if (!itemById.has(i.id)) itemById.set(i.id, i); });
  const getBT = id => {
    const item = itemById.get(id);
    const stateICMS = calcICMSRate(brazilStates.origin, brazilStates.destination);
    // Direct sale + imported item = 4% ICMS regardless of state configuration
    const defaultICMS = proj.salesType === "Direct" && item?.imported === true ? 4 : stateICMS;
    return { ...BR_DEFAULTS, icms: defaultICMS, ...(brazilTaxes[id] || {}) };
  };
  const getItemSalesTax = item => {
    if (!isCIT) return { ipi: 0, pis: 0, cofins: 0, icms: 0, total: 0 };
    const sp = getItemSP(item);
    const discountedSP = sp * (1 - (item.discount || 0) / 100);
    const spBRL = conv(discountedSP, proj.sellCcy, "BRL", proj.rates);
    return calcSalesTax(spBRL, getBT(item.id));
  };
  const getItemImportTaxDetail = item => {
    if (!isCIT) return { customs: 0, ii: 0, total: 0 };
    const alloc = getAlloc(item);
    let customs = 0, ii = 0;
    if (item.imported) {
      const cifBRL = conv(alloc.cif, proj.sellCcy, "BRL", proj.rates);
      const tc = getBT(item.id);
      const bt = calcImportTax(cifBRL, item.customsCharges ?? proj.customsCharges ?? 9, tc.ii ?? 20);
      customs += bt.customs; ii += bt.ii;
    }
    (alloc.importedChildren || []).forEach(c => {
      const cifBRL = conv(c.cifForTax ?? c.totalCOGS, proj.sellCcy, "BRL", proj.rates);
      const tc = getBT(c.id);
      const bt = calcImportTax(cifBRL, c.customsCharges ?? proj.customsCharges ?? 9, tc.ii ?? 20);
      customs += bt.customs; ii += bt.ii;
    });
    return { customs, ii, total: customs + ii };
  };

  let totalImportTax = 0, totalSalesTax = 0, totalTax = 0;
  const salesTaxTotals = { ipi: 0, pis: 0, cofins: 0, icms: 0, total: 0 };
  if (isCIT) {
    tree.forEach(item => {
      const alloc = getAlloc(item);
      totalImportTax += alloc.tax + alloc.siscomex + alloc.afrmm;
      const st = getItemSalesTax(item);
      const qty = item.qty || 1;
      totalSalesTax += conv(st.total * qty, "BRL", proj.sellCcy, proj.rates); // sell currency, for the build-up total
      salesTaxTotals.ipi += st.ipi * qty;  // BRL, for the Brazil tax breakdown display
      salesTaxTotals.pis += st.pis * qty;
      salesTaxTotals.cofins += st.cofins * qty;
      salesTaxTotals.icms += st.icms * qty;
      salesTaxTotals.total += st.total * qty;
    });
    if (!distributeOutboundFreight && totalOutSP > 0 && freightTaxSC > 0) {
      totalSalesTax += freightTaxSC;
      salesTaxTotals.total += conv(freightTaxSC, proj.sellCcy, "BRL", proj.rates);
    }
    totalTax = totalImportTax;
  } else {
    totalTax = tree.reduce((s, n) => s + n.totalCOGS * ((n.tariff || 0) / 100), 0);
  }

  const totalDiscount = tree.reduce((sum, item) => {
    const unitSP = getItemSP(item);
    const discountPct = item.discount || 0;
    if (discountPct === 0) return sum;
    return sum + unitSP * (item.qty || 1) * (discountPct / 100);
  }, 0);
  const buildUpGrossMargin = itemsSP - landedCOGS + totalDiscount;

  const marginByConfidence = { "Very High": [], High: [], Medium: [], Low: [], "Very Low": [] };
  tree.forEach(n => {
    const a = getAlloc(n);
    const netPrice = getItemNetPrice(n);
    const margin = netPrice > 0 ? ((netPrice - a.landed) / netPrice) * 100 : 0;
    const conf = getConfidence(n.source);
    if (marginByConfidence[conf]) marginByConfidence[conf].push({ item: n, margin, value: netPrice });
  });
  const marginBySupplier = {};
  const addSupplier = n => {
    if ((n._ch || []).length > 0) { n._ch.forEach(addSupplier); return; }
    if (n.supplier) {
      const a = getAlloc(n);
      const netPrice = getItemNetPrice(n);
      const margin = netPrice > 0 ? ((netPrice - a.landed) / netPrice) * 100 : 0;
      if (!marginBySupplier[n.supplier]) marginBySupplier[n.supplier] = { items: 0, totalMargin: 0, totalValue: 0 };
      marginBySupplier[n.supplier].items++;
      marginBySupplier[n.supplier].totalMargin += margin;
      marginBySupplier[n.supplier].totalValue += netPrice;
    }
  };
  tree.forEach(addSupplier);

  return { totalImportTax, totalSalesTax, totalTax, salesTaxTotals, totalDiscount, buildUpGrossMargin,
    getBT, getItemSalesTax, getItemImportTaxDetail, marginByConfidence, marginBySupplier };
};
