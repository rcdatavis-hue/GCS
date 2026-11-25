#!/usr/bin/env python3
"""Build the blank scorecard template embedded in the GCS (src/engine/scorecard-template.js) from a filled
Engineered Solutions scorecard workbook. Entry cells are emptied (styles, dropdowns, formulas kept), hidden
legacy sheets are emptied of constants, unused shared strings are blanked, calcChain is dropped and Excel is
told to recalculate on open.  Usage: python3 tools/make-scorecard-template.py <scorecard.xlsx> <out.js>"""
import sys, re, zipfile, base64, io

SRC, OUT = sys.argv[1], sys.argv[2]
def rng(cols, rows): return [f'{c}{r}' for r in rows for c in cols]
COLS_CC = ['B','C','D','E','F','G','H','I','J','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA']
BLANK = {
  'Dashboard': ['H2','R2','H3','R3','H4','R4','H5','R5','H6','R6','I7','B18','G18','L18','Q18','X18','B27','G27','L27','Q27','V27',
                'R29','V29','Q31','V31','R33','C37','C39','N36','N37','N38','N39','C43','C44','E45','I45','E46','I46','C51','O51',
                'C53','G53','J53','E64','E101','C132','C134','C136','C138','C140','M132','M134','M136','M138','X148','X150','D173','B175']
               + rng(['G','N'], range(146, 167, 2)),
  'CashFlow': ['C9','C24'] + rng(['J'], range(8, 15)) + ['C63','J63','C65','J65','C74','J74','C75','J75','D75','K75','D76','K76','L76','D77','K77','D83','K83','E83','L83'],
  'Costing Confidence': rng(COLS_CC, list(range(7, 16)) + [19, 20] + list(range(24, 39))) + ['F41','F42','F43','C43','L43'],
}
WIPE_CONSTANTS = ['BR_Margin_Breakdown', 'KNK_Dashboard', 'MX Dashboard', 'OLD_RiskOverview', 'Pricing Strategy']

zin = zipfile.ZipFile(SRC)
files = {n: zin.read(n) for n in zin.namelist()}
wb = files['xl/workbook.xml'].decode()
rels = files['xl/_rels/workbook.xml.rels'].decode()
sheet_file = {}
for name, rid in re.findall(r'<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"', wb):
    tgt = re.search(r'Id="%s"[^>]*Target="([^"]+)"' % rid, rels) or re.search(r'Target="([^"]+)"[^>]*Id="%s"' % rid, rels)
    sheet_file[name.replace('&amp;', '&')] = 'xl/' + tgt.group(1)

CELL = r'<c r="%s"(?P<a>(?: [^>]*?)?)(?:/>|>(?P<b>.*?)</c>)'
def empty_cell(m):
    a = re.sub(r'\s+t="[^"]*"', '', m.group('a') or '')
    return '<c r="%s"%s/>' % (m.group(0).split('"')[1], a)
for sheet, refs in BLANK.items():
    p = sheet_file[sheet]; x = files[p].decode()
    for ref in refs:
        x = re.sub(CELL % ref, empty_cell, x, flags=re.S)
    files[p] = x.encode()
for sheet in WIPE_CONSTANTS:
    p = sheet_file[sheet]; x = files[p].decode()
    def wipe(m):
        body = m.group('b') or ''
        return m.group(0) if '<f' in body else empty_cell(m)
    x = re.sub(r'<c r="[A-Z]+\d+"(?P<a>(?: [^>]*?)?)(?:/>|>(?P<b>.*?)</c>)', wipe, x, flags=re.S)
    files[p] = x.encode()

# formula cells: drop cached results (they hold the old project's figures); Excel recalculates on open
for n in list(files):
    if n.startswith('xl/worksheets/sheet'):
        x = files[n].decode()
        # cell by cell; dynamic-array formulas (t="array", spill ranges, cm= metadata) keep their cached results,
        # because Excel reports the file as corrupt if a spilled formula has no value while its spill cells do
        def strip(m):
            c = m.group(0)
            if '<f' not in c or '<f t="array"' in c: return c
            c = re.sub(r'^(<c [^>]*?)\s+t="(?:str|e|n|b)"', r'\1', c)
            return re.sub(r'<v>[^<]*</v>', '', c)
        x = re.sub(r'<c r="[A-Z]+\d+"[^>]*?(?:/>|>.*?</c>)', strip, x, flags=re.S)
        files[n] = x.encode()
# external hyperlinks (old project's Salesforce / SharePoint / approval links)
for n in list(files):
    m = re.match(r'xl/worksheets/_rels/(sheet\d+\.xml)\.rels$', n)
    if not m: continue
    r = files[n].decode(); ids = re.findall(r'<Relationship Id="(rId\d+)"[^>]*relationships/hyperlink"[^>]*/>', r)
    if not ids: continue
    r = re.sub(r'<Relationship [^>]*relationships/hyperlink"[^>]*/>', '', r); files[n] = r.encode()
    sp = 'xl/worksheets/' + m.group(1); x = files[sp].decode()
    for rid in ids: x = re.sub(r'<hyperlink [^>]*r:id="%s"[^>]*/>' % rid, '', x)
    x = re.sub(r'<hyperlinks>\s*</hyperlinks>', '', x); files[sp] = x.encode()
# text boxes with project narrative: keep each heading paragraph, empty the rest
HEADINGS = ('Customer Insights', 'Competition / Pricing', 'Project Comparability')
for n in list(files):
    if not re.match(r'xl/drawings/drawing\d+\.xml$', n): continue
    d = files[n].decode()
    def scrub(sm):
        sh = sm.group(0); paras = re.findall(r'<a:p>.*?</a:p>|<a:p/>', sh, flags=re.S)
        if not paras: return sh
        first = ''.join(re.findall(r'<a:t>([^<]*)</a:t>', paras[0])).strip()
        if first not in HEADINGS: return sh
        out = sh
        for p in paras[1:]: out = out.replace(p, re.sub(r'<a:t>[^<]*</a:t>', '<a:t></a:t>', p), 1)
        return out
    files[n] = re.sub(r'<xdr:sp\b.*?</xdr:sp>', scrub, d, flags=re.S).encode()

# shared strings still referenced
used = set()
for n, b in files.items():
    if n.startswith('xl/worksheets/sheet'):
        for m in re.finditer(r'<c [^>]*t="s"[^>]*>(?:<f[^>]*/>|<f[^>]*>.*?</f>)?<v>(\d+)</v>', b.decode(), flags=re.S): used.add(int(m.group(1)))
sst = files['xl/sharedStrings.xml'].decode()
items = re.findall(r'<si>.*?</si>', sst, flags=re.S)
head = sst[:sst.index('<si>')]; tail = sst[sst.rindex('</si>') + 5:]
items = [it if i in used else '<si><t></t></si>' for i, it in enumerate(items)]
files['xl/sharedStrings.xml'] = (head + ''.join(items) + tail).encode()

# drop calcChain, recalc on open
files.pop('xl/calcChain.xml', None)
files['xl/_rels/workbook.xml.rels'] = re.sub(r'<Relationship [^>]*calcChain[^>]*/>', '', rels).encode()
files['[Content_Types].xml'] = re.sub(r'<Override [^>]*calcChain[^>]*/>', '', files['[Content_Types].xml'].decode()).encode()
if '<calcPr' in wb: wb = re.sub(r'<calcPr([^>]*)/>', lambda m: '<calcPr' + re.sub(r'\s*fullCalcOnLoad="[^"]*"', '', m.group(1)) + ' fullCalcOnLoad="1"/>', wb)
else: wb = wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>')
files['xl/workbook.xml'] = wb.encode()

buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for n in zin.namelist():
        if n in files: z.writestr(n, files[n])
b64 = base64.b64encode(buf.getvalue()).decode()
open(OUT, 'w').write('\n// ═══ SCORECARD TEMPLATE ═══ Engineered Solutions scorecard (version ES_26.13), entry cells emptied.\n'
    '// Generated by tools/make-scorecard-template.py; do not edit by hand.\nconst GCS_SCORECARD_TEMPLATE_B64 = "' + b64 + '";\n')
print('template', len(buf.getvalue()), 'bytes; base64', len(b64), '; sheets', sheet_file)
