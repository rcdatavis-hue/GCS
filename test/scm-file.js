// Direct SCM file import (no index or folder): pick a V2 model file, import into a tab, BOM headers appear.
// Usage: node test/scm-file.js <built.html> <v2-model.xlsx>
const fs = require('fs'); const { launch, openApp } = require('./harness');
const [, , html, modelFile] = process.argv;
const results = []; const ok = (n, c, d) => results.push({ n, pass: !!c, d });
const st = JSON.parse(fs.readFileSync(__dirname + '/fixtures/01-flat-basic.json', 'utf8')); st.gcsFormat = 1;
st.costingSheets = [{ id: 'main', name: 'Plant Section 1' }];
st.items = [{ id: 'A', type: 'item', parentId: null, sheetId: 'main', partNumber: 'PA', description: 'First', qty: 1, unitCost: 10, ccy: 'USD', source: 'Quotation' }];
(async () => {
  const b = await launch(); const { page, errors } = await openApp(b, html, JSON.stringify(st), { height: 6000 });
  await page.click('.pcw-nav .pcw-tab >> nth=1'); await page.waitForTimeout(300);
  await page.click('[data-scm=open]'); await page.waitForSelector('[data-scm=panel]');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-scm=model-file]')]);
  await fc.setFiles(modelFile); await page.waitForSelector('[data-scm=file-models]');
  const bc = await page.$eval('[data-scm=basket-count]', e => e.innerText);
  ok('file added to the basket without an index', /1 model · 109 lines/.test(bc), bc);
  ok('basket entry shows V2 and the Draft warning', /V2 · 109 lines/.test(await page.$eval('[data-scm=file-models]', e => e.innerText)) && /Draft/.test(await page.$eval('[data-scm=basket]', e => e.innerText)));
  await page.click('[data-scm=import]'); await page.waitForSelector('[data-scm=result]');
  const r = await page.$eval('[data-scm=result]', e => e.innerText);
  ok('import result lists assemblies and the SCM data issue', /Imported 1 model, 102 lines/.test(r) && /7 assemblies/.test(r) && /10281456/.test(r), r.replace(/\s+/g, ' ').slice(0, 300));
  await page.click('[data-scm=close]'); await page.waitForTimeout(400);
  ok('7 assembly headers in the table', (await page.$$eval('tr[data-bom-asm]', x => x.length)) === 7);
  ok('existing line kept', !!(await page.$('[data-cell="A-partNo"]')));
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await b.close();
  results.forEach(x => console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.n}${x.d !== undefined ? '  — ' + x.d : ''}`));
  const f = results.filter(x => !x.pass); console.log(`\n${results.length - f.length}/${results.length} passed`); process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
