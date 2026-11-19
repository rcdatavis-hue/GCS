# Global Cost Sheet (GCS)

Standalone fork of the Parts Costing Worksheet (PCW), for capital/project costing. It is to replace the Excel Global Cost Sheet (GCS V3.8, .xlsm) ($500k–$100M, up to ~10,000 lines).
Forked from **PCW v0.8 · 2026-11-17**. It develops separately: the PCW stays in use for aftermarket parts, and fixes are
**not** shared automatically in either direction. When a PCW fix is wanted here, port it by hand and note it below.

## Separate identity (so both apps can run in one browser)
Set in `src/engine/security.js`: `APP_ID = 'gcs'`, `APP_NAME`, `APP_SHORT`, `FILE_EXT = '.gcs'`, `FORKED_FROM`.
- Browser storage: every localStorage key and the IndexedDB database use the `gcs-` prefix (PCW uses `pcw-`). On one
  GitHub Pages account both apps share an origin, so without this the fork would load and overwrite the PCW autosave.
- Files save as `.gcs`. Upload, the open-file dialog and drag-and-drop also accept PCW `.pcw` files, so a parts quote can be brought in.
- Launch link `gcs://`; page title, logo and save-package names say GCS.
- Unchanged on purpose: CSS class names (`pcw-*`, internal only), `PCW_VERSION`/`PCW_BUILD` constant names, and the
  "PCW Feed" label (it is the same company feed file).
- Deployment files `manifest.json` and `sw.js` are not in this source; the fork needs its own copies (own name, file
  handler for `.gcs`, protocol `gcs`) when it gets its GitHub Pages repo.

Renaming the app later: change the constants above plus the literal names in `shell.html` (title, apple title, `gcs://`)
and the `.gcs` text in the UI. `APP_ID` changes the storage keys, so existing autosaves would not carry over.

## Build and test
`node build.js` → `dist/index.html`. Update `PCW_BUILD` on every shipped change (badge shows `v0.1 · <date>`).
Tests as in the PCW (Playwright + Chrome; NODE_PATH to a folder with playwright, react@18.2.0, react-dom@18.2.0,
xlsx@0.18.5, jszip@3.10.1, @babel/parser):
- `test/make-fixtures.js`, `test/snapshot.js <html> <out>`, `test/verify.js test/baseline <out>`: 10-fixture screen regression.
  `test/baseline` was taken from this fork at v0.1 and differs from the PCW baseline only in name and file extension.
- `test/excel-parity.js dist/index.html [runs]`: the GCS engine against an independent model of the Excel GCS V3.8
  formulas (plant-section rows, provisions, Summary rounding/discount/EBITDA, segment targets) on random projects.
  This replaces the PCW engine-equivalence check, which no longer applies since v0.2 changed the method.
- `test/gcs-ui.js dist/index.html`: 19 end-to-end checks of the GCS screens (levels, tab markup table, Custom %,
  automatic/overridden inflation and scaling, tab discount, options, contract value, segment target, conversion of
  old files on load and after autosave). Cells are focused, then a 120 ms pause before typing: NumInput switches to
  edit mode on focus, and typing in the same instant can be lost (machine-speed only, not reachable by hand).
- `test/export-check.js` / `test/export-html.js`: Excel export (GCS Summary sheet total = app) and HTML export run cleanly.
- `test/isolation.js dist/index.html`: ignores and preserves PCW browser data; opens `.pcw` files.
- `test/make-big.js` + `test/perf.js`: 10,000-line timing.
- `test/scm-engine.js dist/index.html <SCM_Master_Index.xlsm> <model.xlsx>`: SCM parsing, search, V1/V2 line building,
  insertion and latest-cost picking against real files (15 checks).
- `test/scm-ui.js dist/index.html <SCM_Master_Index.xlsm> <model.xlsx>`: SCM Search end to end with a simulated synced
  folder (stubbed `showDirectoryPicker`) and a stubbed feed (14 checks). `SHOT=/tmp/x` saves screenshots.
- `test/cost-source.js dist/index.html`: automatic cost from any BU, the cost source location and picker, lead time default, manual cost override (22 checks).
- `test/feed-rates.js dist/index.html`: rates refresh on the first feed load only, manual refresh, locked projects untouched; Summary suppliers collapsed (7 checks).
- `test/tab-totals.js dist/index.html`: TOTALS row per tab, line sales total across tabs (4 checks).
- `test/scale-infl.js dist/index.html`: scaling column visibility by segment, inflation colours, cost date default, category codes (14 checks).
- `test/readiness.js dist/index.html`: readiness per tab, PASS counts, colours, tooltip, row shading (13 checks).
- `test/discounts.js dist/index.html`: discount fields in Setup and Summary, per-line discount column default (8 checks).
- `test/eqd-ui.js dist/index.html <feed with EQD sheet.xlsx>`: EQD picker, scaling rule, clear, CNY conversion, EQD Search (12 checks).
- `test/confidence.js dist/index.html`: confidence score per tab, project and header; ICUG hidden (8 checks).
- `harness.js` seeds the autosave under `STATE_KEY` (default `gcs-state-v1`).

## Changelog
- v0.18 · 2026-11-19: Item Cost Use Guidance hidden (aftermarket only): not offered in the Source lists (`GCS_HIDDEN_SOURCES`;
  a line or default that already uses it keeps it), no "✦ Est" / "Apply Est." estimate buttons. `test/confidence.js` 8 checks.
- v0.17 · 2026-11-19: costing confidence is a weighted score again, as in the PCW. Each source has a score out of 5
  (`SOURCE_SCORE`: Quotation 5, Pricelist 4, Project Cost / EQD / ICUG 3, Estimate 2, none 0); a tab's or the project's
  rate = cost-weighted average ÷ 5, level Very Low..Very High (`gcsConfidenceMix` score / rate / level). Tab settings
  show a small gauge + level + rate; Summary lists each tab and the project with the source shares; the header Cost
  Confidence uses the same project score (included tabs, inflation/scaling-adjusted cost). `test/confidence.js` 6 checks.
- v0.16 · 2026-11-19: costing confidence strip (replaces the Excel per-section pie). `gcsConfidenceMix` splits each tab's
  line cost by Source (leaf costs and BOM parents' own cost, multiplied through parent quantities); shown as a 100%
  stacked strip with the two largest shares in the Tab settings bar, and per tab + project in the Summary's GCS
  card (hover for amounts). Categories are the web Source values, not Excel's confidence labels (Ryan, 19 Nov), so
  Excel's confidence bands are not shown. Test `test/confidence.js` (5 checks).
- v0.15 · 2026-11-19: removed the aftermarket SAP tools from the costing toolbar: "Copy for SAP B1", "Import Line
  Items from SAP Quote (.xlsx)" and "Import SAP BOM" (their handlers remain in parts-worksheet.js, unreachable).
- v0.14 · 2026-11-19: EQD (Equipment Quotations Database) for Liquids, replacing the Excel macros
  modUnifiedEQDLookup / modLiquidsEQDProduction.
  - Feed: new sheet type `eqd` (sheet named EQD / "Equipment Quotations…" / SPQuoteDB) with the SharePoint list's
    columns; `DataService.getEqd()` returns Liquids quotes with a price, normalised (currency codes, dates, size,
    description = SAPDescription or Description, drawing = Model-Drawing / Reference Drawing / Model # / RefDwgPrefix).
  - Engine (gcs.js): `gcsEqdQuery` / `gcsEqdLatest` (Excel exact match on equipment, material, size, vendor; latest
    quote date), `gcsEqdOptions` (cascading lists), `gcsEqdPrice` (currencies the app lacks, e.g. CNY / JPY, convert
    to USD at the project rates), `gcsEqdPatch` (cost, currency, quote date → cost date, SAP item, description,
    drawing, vendor, size, source EQD, cost source EQD + bid office, snapshot of the line before) and
    `gcsEqdClearPatch` (restores it). Latest-cost autofill and refresh never overwrite an EQD line.
  - **Scaling now only applies automatically to EQD lines** (Excel rule); other lines are 1.00× unless typed.
  - Screens: EQD column (equipment · material · size · vendor picker with the matching quotes and links to the
    vendor quote and drawing; Clear EQD), shown with Scale × / Size for Liquids segments; "EQD Search" panel next
    to SCM Search adds chosen quotes as lines to a tab / position. Source list gains "EQD".
  - Tests: `test/eqd-ui.js` (12 checks, real EQD export); excel-parity and gcs-ui mark sized lines as EQD.
- v0.13 · 2026-11-19: discounts easier to find.
  - Setup: "Discounts & commissions" group in the GCS Costing Method card (project discount %, discount mitigation %,
    dealer / agent %, default cost source). The PCW "Default Margins & Settings" card and its per-item
    discount/contingency text are removed.
  - Summary: the project discount % is editable in the GCS Commercial Summary's contract value block (same field;
    notes when some tabs set their own).
  - Costing: per-line Discount % hidden by default (saved layouts switched once, `_gcsLineDiscountDefault`); shown
    automatically when the project has line discounts. Test `test/discounts.js` (8 checks).
- v0.12 · 2026-11-19: row completion shading (green = cost and markup set, yellow = only one).
  - It read the raw margin field, which is 0 for lines priced by a markup level, so such lines never turned green;
    it now uses the same markup rule as readiness (level incl. PASS, Custom % > 0 or manual sell price), on screen and
    in the HTML/PDF export.
  - The setting ("Completion colour coding", Setup) is stored per app, so the PCW's choice did not carry over and
    the GCS started with it off; it is now on unless turned off. `test/readiness.js` 13 checks.
- v0.11 · 2026-11-19: quote readiness fixes.
  - The readiness bar counted every tab; it now describes the tab on screen (labelled with its name), from the same
    per-line rule as the row tick (`pricing.quoteReadyMap`).
  - Lines at PASS (0%) never counted as ready; any markup level now counts (Custom needs a % above 0, or a manual sell
    price) — `pricing.hasMarkupOf`. The row tooltip checked the raw margin field and said "missing margin" on
    level-priced lines; it now uses the same rule.
  - Bar under 33% was drawn grey on a grey track (invisible). Colours now: red < 33%, amber 33-65%, light green
    66-99%, green 100% (`gcsReadinessColor`), and the % label uses the same colour.
  - Test `test/readiness.js` (8 checks).
- v0.10 · 2026-11-19: fewer visible columns. Cost Date hidden by default (layouts saved earlier switched once,
  `_gcsCostDateDefault`; inflation's tooltip still states the months since the cost date). Category shows codes
  only (A, C, C5 …; 46 px), with the name in the option tooltip, the group heading and the cell tooltip
  (`gcsCategoryName`). Tests: `test/scale-infl.js` 14 checks; UI tests that type cost dates show the column.
- v0.9 · 2026-11-19:
  - Scaling is its own column, "Scale × / Size" (scaling factor + the equipment size that drives it), hidden by
    default and shown automatically when the project or any tab has a Liquids segment (applied on load and when
    that changes; the Columns menu can still override). "Cost Date / Size" is now "Cost Date"; "Infl. % / Scale ×"
    is now "Inflation %".
  - Inflation traffic light (`gcsInflationBand`): under 5% green, 5% to under 10% amber, 10% and over red; no colour
    when the line has no cost date and no typed inflation. Typed values are bold with ↺.
  - Test `test/scale-infl.js` (12 checks); `test/gcs-ui.js` fixture tab set to a Liquids segment.
- v0.8 · 2026-11-19: fix: the TOTALS row under the costing table showed the whole project on every tab. It now
  totals the tab on screen (labelled with the tab name; same line figures as the GCS summary, before provisions);
  the LINE SALES TOTAL row below still covers all tabs. Test `test/tab-totals.js` (4 checks).
- v0.7 · 2026-11-19:
  - Exchange rates refresh automatically only on the first feed load of the session (reconnect at start-up or first
    connect; unlocked projects). Later reconnects and re-reads leave them; use Setup "Refresh from Feed".
  - Typing, pasting or filling down a cost clears a "Project Cost" source (other sources kept; a source pasted in
    the same edit wins) along with the cost source location (`gcsManualCostPatch`). A currency change clears the
    location only.
  - Tests: `test/feed-rates.js` 7 checks, `test/cost-source.js` 22 checks.
- v0.6 · 2026-11-19: exchange rates refresh automatically from the feed file's currency sheet whenever the feed is
  connected, reconnected on start-up or re-read (unlocked projects only; waits until the saved project has loaded).
  Summary: Selected Suppliers is a collapsible card, collapsed by default with a one-line summary
  (`GcsCollapsibleCard`). Test `test/feed-rates.js` (5 checks, real .xlsx feed through a stubbed file picker).
- v0.5 · 2026-11-19: Cost Source picker and per-line lead time hidden.
  - Clicking the Cost Source cell lists every business unit with a PO/PQ cost for the part (latest per BU, USD,
    `DataService.getLatestCostByBU`); choosing one pulls that BU's cost, date, supplier and reference into the line
    (like changing the Cost Source Location in Excel). It replaces a typed cost, being an explicit choice.
    "Full cost history" opens the history with all BUs.
  - Lead Time (D) column hidden by default (project costing); layouts saved earlier are switched once
    (`_gcsLeadTimeDefault` flag), after which it can be shown again from Columns.
  - `test/cost-source.js` now 20 checks.
- v0.4 · 2026-11-19: automatic cost from the feed regardless of business unit, with its cost source location.
  - `DataService.getLatestCost(part)`: latest positive-cost PO or PQ across every BU (feed costs are USD; same
    date → the PO), indexed once per loaded sheet. Used by every autofill: typing a part number, SAP quote import,
    paste, bulk refresh and SCM import. It takes priority over the pricelist (as in the Excel GCS latest-cost
    lookup); a pricelist cost is still used when the part has no PO/PQ.
  - Fills cost (USD), cost date (so automatic inflation runs from it), supplier if blank or auto-filled, source
    "Project Cost", and `costLocation` + `costRef` {type, doc, date, qty, supplier, bu, cost}. Typed costs are never
    overwritten (except by a refresh told to overwrite); typing a cost or currency clears the location.
  - New "Cost Source" column after Unit Cost: BU badge (amber when not the project BU) + PO/PQ/PL, tooltip with the
    document; click opens the cost history with the other BUs already listed. Excel export: "Cost Source Location"
    and "Cost Reference" columns.
  - Test `test/cost-source.js` (13 checks; feed simulated with `DataService.__seedSheets`).
- v0.3 · 2026-11-19: SCM (Sales Cost Model) search and import, replacing the Excel GCS "SCM Search" macro and sheet.
  - Engine `engine/scm.js`: reads `SCM_Master_Index_v1.xlsm` (catalogue, model lines, Data Quality, Refresh Log) or
    every SCM file directly; V1 and V2 model files (V2 adds BOM level, tag and supplier reference; BOM levels become
    parent/child lines); search with the 12 Excel filters (drawing number searches every model line).
  - Library access: the synced Commercial Costing Program folder through the browser folder picker (Chrome/Edge),
    remembered between sessions; or open the index file directly. Imports read each model's own file when found
    (latest edits), else the index copy, and say which.
  - "SCM Search" button next to "+ Add Tab": filters, results, import basket, warnings for non-Approved models and
    index data-quality entries, destination tab and position (default: the line you were on, as in Excel).
  - Each model comes in under a heading line; SAP items in Part No.; quantities as they are; no sizing from the model
    rate. With the feed connected, empty costs are filled from the latest PO/PQ for the project BU.
- v0.2 · 2026-11-17: Excel GCS costing method (see project doc claude/GCS_EXCEL_LOGIC_MAP.md).
  - Engine `engine/gcs.js`: markup levels (margin on sell) per tab, Custom %; unit cost × scaling × (1 + inflation),
    both automatic as in Excel (0.5%/month since the cost date; (plant feed ÷ size)^0.6) and overridable per line;
    four per-tab provisions (start-up risk 1% of sales, FCA/packing 2% of cost, C5 duty 5.1%, H1 duty 0%); Excel P&L
    (COGS, contribution, M&E, gross margin after M&E, S&A, EBITDA); segment targets (>/< $1m) and bands; tab prices
    rounded up to 1,000; project or per-tab discount on the rounded price; shipping as a contract line, not in EBITDA.
  - Contingency removed; packing & crating removed. Files from before (PCW .pcw, GCS v0.1) are converted once on load:
    every line becomes Custom with its old margin and any contingency folded in (1 − (1 − m)(1 − c)), so prices
    do not change. Saved state carries `gcsFormat: 1`.
  - Screens: Markup, Infl. % / Scale ×, Cost Date / Size and Category columns; tab settings panel; GCS Costing Method
    card in Setup; GCS Commercial Summary card; header and approvals use the total contract value; old PCW margin
    warnings (35% rule) replaced by negative-EBITDA / below-target / no-segment checks.
  - Exports: Excel adds a GCS Summary sheet and the new line columns (and fixes Unit/Total Sell Price columns, which
    held net unit and gross unit); CSV/PDF show markup level and effective margin.
  - Approval integrity hash now covers markup levels, tab markup tables/provisions/discounts, inflation/scaling inputs
    and project GCS settings, with the contract value.
  - Fixes also relevant to the PCW (not ported there): Tab from a cell whose next cell is absent (e.g. BOM children,
    which have no margin cell) did nothing and the typed value was not saved; totals row miscounted columns when row
    numbers were shown; outbound-freight rows used a fixed column list instead of the user's column order.
- v0.1 · 2026-11-17: renamed from the working name Project Cost Estimator (PCE) to Global Cost Sheet (GCS); storage prefix `gcs-`, files `.gcs`, link `gcs://`. Kept for now (may need rework later): SharePoint import, Salesforce import, Brazil/CIT taxes.
- v0.1 · 2026-11-17: forked from PCW v0.8 · 2026-11-17 (which already includes the extracted pricing engine in
  `engine/pricing.js`, the row-number speed fix and the Unit Cost / pricelist-flag fix). Own identity as above.
  No methodology changes yet.
