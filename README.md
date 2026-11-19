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
- `harness.js` seeds the autosave under `STATE_KEY` (default `gcs-state-v1`).

## Changelog
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
