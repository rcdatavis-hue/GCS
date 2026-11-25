// Scorecard export: downloads the filled workbook, checks the written cells, and (when LibreOffice is present)
// recalculates it to check the template's formulas pick the values up.
// Usage: node test/scorecard.js <built.html>
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { launch, openApp } = require('./harness');
const XLSX = require(path.join(process.env.NM || path.join(process.env.HOME, 'tools/node_modules'), 'xlsx'));
const html = process.argv[2];
const results = []; const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail });
const base = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8'));
const st = JSON.parse(JSON.stringify(base)); st.gcsFormat = 1;
st.project = { ...st.project, name: 'Test Prep Plant', ref: 'Q99-00001-TEST', bu: 'CIW', customer: { name: 'Cargill Inc', code: 'C1', country: 'USA', city: 'Minneapolis, MN' },
  incoterm: 'DAP', sellCcy: 'USD', defaultDealer: 2, discountMitigation: 0, gcsDiscount: 5, costingDate: '2026-11-19', mAndE: 10, sAndAExpense: 12 };
st.costingSheets = [{ id: 'main', name: 'Plant Section 1' }, { id: 'opt', name: 'Option A', type: 'option', include: false }];
const L = (id, extra) => ({ id, type: 'item', parentId: null, sheetId: 'main', partNumber: 'P' + id, description: 'Line ' + id, supplier: 'S' + id, qty: 1, unitCost: 0, ccy: 'USD', source: 'Quotation', ...extra });
st.items = [
  L('F1', { unitCost: 100000, category: 'A', subCat: 'A2', supplier: 'FEC', costDate: '2026-09-01' }),
  L('F2', { unitCost: 50000, ccy: 'EUR', category: 'A', subCat: 'A3', supplier: 'EuroFab', costDate: '2026-10-01' }),
  L('B1', { unitCost: 40000, category: 'B', supplier: 'IS', source: 'Quotation', costDate: '2026-10-29' }),
  ...Array.from({ length: 17 }, (_, i) => L('T' + i, { unitCost: 1000 * (i + 1), category: 'C', source: i % 3 ? 'Project Cost' : 'Estimate', costDate: '2024-01-01' })),
  { ...L('X1', { unitCost: 99999, category: 'A' }), sheetId: 'opt' },
];
(async () => {
  const b = await launch(); const { page, errors, ctx } = await openApp(b, html, JSON.stringify(st));
  await page.click('.pcw-nav .pcw-tab >> text=Summary'); await page.waitForSelector('[data-gcs=scorecard]');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-gcs=scorecard]')]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-')); const file = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(file);
  ok('download named after the quote', /^Scorecard_Q99-00001-TEST_\d{4}-\d{2}-\d{2}\.xlsx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const wb = XLSX.readFile(file);
  const v = (sh, ref) => { const c = wb.Sheets[sh][ref]; return c ? c.v : undefined; };
  ok('header: customer, quote, description, office, location, agent', v('Dashboard', 'H2') === 'Cargill Inc' && v('Dashboard', 'R2') === 'Q99-00001-TEST' && v('Dashboard', 'H3') === 'Test Prep Plant' && v('Dashboard', 'R3') === 'CIW: Blaine, USA' && v('Dashboard', 'H4') === 'Minneapolis, MN, USA' && v('Dashboard', 'R5') === 'Yes',
    [v('Dashboard', 'H2'), v('Dashboard', 'R2'), v('Dashboard', 'R3'), v('Dashboard', 'H4'), v('Dashboard', 'R5')].join(' | '));
  ok('Tier 1 suggested for Cargill', /^Tier 1/.test(v('Dashboard', 'B18') || ''), v('Dashboard', 'B18'));
  ok('costing confidence suggested (Medium: < 80% recently quoted, ≤ 20% estimates)', /^Medium:/.test(v('Dashboard', 'B27') || ''), v('Dashboard', 'B27'));
  ok('supplier currencies: fabrication mix, 3rd party USD', /USD \d+% \| EUR \d+%/.test(v('Dashboard', 'V29') || '') && v('Dashboard', 'V31') === 'USD', v('Dashboard', 'V29') + ' / ' + v('Dashboard', 'V31'));
  ok('payment currency, discount, incoterm, M&E / S&A', v('Dashboard', 'O51') === 'Payment Receipt in USD' && v('Dashboard', 'C53') === '5%' && v('Dashboard', 'C134') === 'DAP' && v('Dashboard', 'A72') === 0.1 && v('Dashboard', 'A78') === 0.12,
    [v('Dashboard', 'O51'), v('Dashboard', 'C53'), v('Dashboard', 'C134'), v('Dashboard', 'A72'), v('Dashboard', 'A78')].join(' | '));
  const cc = r => [v('Costing Confidence', 'B' + r), v('Costing Confidence', 'C' + r), v('Costing Confidence', 'F' + r), v('Costing Confidence', 'L' + r), v('Costing Confidence', 'M' + r), v('Costing Confidence', 'O' + r)];
  ok('fabricated block: biggest first (cost incl. inflation), rigor QUOTE, recent → High', cc(7)[2] === 101000 && cc(7)[3] === 'QUOTE' && cc(7)[5] === 'High' && cc(7)[0] === 'Fabricated Equipment' && cc(8)[4] === 'EuroFab', JSON.stringify([cc(7), cc(8)]));
  ok('CPM block from category B', cc(19)[2] === 40000 && cc(19)[4] === 'IS', JSON.stringify(cc(19)));
  const third = Array.from({ length: 15 }, (_, i) => cc(24 + i));
  const thirdTotal = third.reduce((s, r) => s + (r[2] || 0), 0);
  const thirdExpect = Array.from({ length: 17 }, (_, i) => 1000 * (i + 1) * 1.17).reduce((a, b) => a + b, 0);
  ok('3rd party: 17 lines into 15 rows (14 + 1 grouping the other 3), total kept', Math.abs(thirdTotal - thirdExpect) < 0.05 && /3 further lines/.test(third[14][1]) && third[0][2] === 19890 && third[0][3] === 'PROJECT COST' && third[1][3] === 'ESTIMATE', `${thirdTotal} · ${third[14][1]} · ${third[1][3]}`);
  ok('excluded option not exported', !JSON.stringify(wb.Sheets['GCS Lines']).includes('Line X1'));
  ok('provisions: start-up risk and freight', v('Costing Confidence', 'F41') > 0 && v('Costing Confidence', 'F42') > 0, v('Costing Confidence', 'F41') + ' / ' + v('Costing Confidence', 'F42'));
  ok('CashFlow: equipment value (less agent commission), CPM sell/cost, section labels', v('CashFlow', 'C9') > 300000 && Math.abs(v('CashFlow', 'C9') + v('CashFlow', 'C17') - 751000) <= 1 && v('CashFlow', 'L76') === 40000 && v('CashFlow', 'C63') === 'Test Prep Plant (ES Total)', [v('CashFlow', 'C9'), v('CashFlow', 'D76'), v('CashFlow', 'L76'), v('CashFlow', 'C63')].join(' | '));
  ok('GCS Lines sheet lists every line', XLSX.utils.sheet_to_json(wb.Sheets['GCS Lines'], { header: 1 }).filter(r => /^Plant Section 1$/.test(r[0])).length === 20);
  ok('manual fields left blank (region, relationship, contract law, approvals)', [['Dashboard', 'Q18'], ['Dashboard', 'L18'], ['Dashboard', 'C136'], ['Dashboard', 'G146']].every(([s, r]) => v(s, r) === undefined));
  // Recalculate with LibreOffice and read the Dashboard numbers driven by formulas
  let soffice = null; try { soffice = execFileSync('which', ['soffice']).toString().trim(); } catch (e) {}
  if (soffice) {
    const out = path.join(tmp, 'calc'); fs.mkdirSync(out);
    execFileSync(soffice, ['--headless', '--calc', '--convert-to', 'xlsx', '--outdir', out, file], { stdio: 'ignore', timeout: 120000 });
    const wc = XLSX.readFile(path.join(out, path.basename(file)));
    const cv = (sh, ref) => { const c = wc.Sheets[sh][ref]; return c ? c.v : undefined; };
    const fab = cv('Dashboard', 'H37'), fabCost = (v('Costing Confidence', 'F7') + v('Costing Confidence', 'F8')) / 1000;
    ok('after recalculation: Dashboard material cost (fabrication, $k) = Costing Confidence total', Math.abs(fab - fabCost) < 0.01, `${fab} vs ${fabCost}`);
    ok('after recalculation: header copied to CashFlow / Costing Confidence', cv('CashFlow', 'E2') === 'Cargill Inc' && cv('Costing Confidence', 'D2') === 'Cargill Inc');
    ok('after recalculation: Dashboard cost of materials = GCS cost of goods', Math.abs(cv('Dashboard', 'L70') * 1000 - (v('Costing Confidence', 'F7') + v('Costing Confidence', 'F8') + v('Costing Confidence', 'F19') + Array.from({ length: 15 }, (_, i) => v('Costing Confidence', 'F' + (24 + i)) || 0).reduce((a, b) => a + b, 0) + v('Costing Confidence', 'F41') + v('Costing Confidence', 'F42'))) < 1, cv('Dashboard', 'L70'));
    ok('after recalculation: Dashboard ES sale value ($k) = CashFlow equipment − IS', Math.abs(cv('Dashboard', 'C58') - (v('CashFlow', 'C9') - v('CashFlow', 'D76')) / 1000) < 0.01, cv('Dashboard', 'C58'));
    ok('after recalculation: Dashboard EBITDA computed (no errors)', typeof cv('Dashboard', 'L79') === 'number' && typeof cv('Dashboard', 'L80') === 'number', `${cv('Dashboard', 'L79')} / ${cv('Dashboard', 'L80')}`);
  } else ok('LibreOffice recalculation (skipped: soffice not found)', true);
  await page.click('[data-gcs=pl-toggle]'); await page.waitForTimeout(150);
  const gcs = await page.evaluate(() => { const t = document.querySelector('[data-gcs=summary]').innerText; const g = re => { const m = t.match(re); return m ? parseFloat(m[1].replace(/,/g, '')) : null; }; return { cogs: g(/Cost of goods \(incl\. provisions\)\s*([\d,\.]+)/), contract: g(/Rounded up, before discount\s*([\d,\.]+)/) }; });
  ok('Costing Confidence total (lines + provisions) = GCS cost of goods', Math.abs(v('Costing Confidence', 'F7') + v('Costing Confidence', 'F8') + v('Costing Confidence', 'F19') + Array.from({ length: 15 }, (_, i) => v('Costing Confidence', 'F' + (24 + i)) || 0).reduce((a, b) => a + b, 0) + v('Costing Confidence', 'F41') + v('Costing Confidence', 'F42') - gcs.cogs) < 0.05, JSON.stringify(gcs));
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await b.close();
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== undefined ? '  — ' + r.detail : '')));
  console.log(`${results.filter(r => r.pass).length}/${results.length} pass`); process.exit(results.every(r => r.pass) ? 0 : 1);
})();
