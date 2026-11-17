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
- `test/engine-equivalence.js reference/pcw-v0.8-2026-11-17.html dist/index.html`: engine identical to the fork point.
  Once the fork's methodology deliberately diverges, this check is expected to fail; retire it or re-point it then.
- `test/isolation.js dist/index.html`: ignores and preserves PCW browser data; opens `.pcw` files.
- `test/make-big.js` + `test/perf.js`: 10,000-line timing.
- `harness.js` seeds the autosave under `STATE_KEY` (default `gcs-state-v1`).

## Changelog
- v0.1 · 2026-11-17: renamed from the working name Project Cost Estimator (PCE) to Global Cost Sheet (GCS); storage prefix `gcs-`, files `.gcs`, link `gcs://`. Kept for now (may need rework later): SharePoint import, Salesforce import, Brazil/CIT taxes.
- v0.1 · 2026-11-17: forked from PCW v0.8 · 2026-11-17 (which already includes the extracted pricing engine in
  `engine/pricing.js`, the row-number speed fix and the Unit Cost / pricelist-flag fix). Own identity as above.
  No methodology changes yet.
