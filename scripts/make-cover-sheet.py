#!/usr/bin/env python3
"""Turns one sheet of a workbook into a 'cover sheet' file the app can show instead of the chat.

  python3 scripts/make-cover-sheet.py "My workbook.xlsx" "Sheet name" cover-sheet.json

Needs LibreOffice (soffice, with its python 'uno'), poppler (pdftocairo) and Pillow.
The sheet becomes a transparent picture (cells, text, colours, logos) at twice screen size, plus the
real column widths and row heights so the app can draw the grid, row numbers and column letters around it.
Import the .json in the app (Settings > Display > Cover sheet). Nothing else is stored.
"""
import base64, io, json, os, subprocess, sys, tempfile, time

import uno
from com.sun.star.beans import PropertyValue
from PIL import Image

src, target, out_json = sys.argv[1], sys.argv[2], sys.argv[3]
MAX_W, MAX_H = 2200, 1000


def pv(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p


px = lambda v: v / 100 / 25.4 * 96
tmp = tempfile.mkdtemp()
proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore', '--accept=socket,host=localhost,port=2002;urp;'],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ctx = None
for _ in range(90):
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        ctx = resolver.resolve('uno:socket,host=localhost,port=2002;urp;StarOffice.ComponentContext'); break
    except Exception:
        time.sleep(1)
desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
doc = desktop.loadComponentFromURL('file://' + os.path.abspath(src), '_blank', 0, (pv('Hidden', True),))
sheets = doc.Sheets
tabs = [sheets.getByIndex(i).Name for i in range(sheets.Count) if sheets.getByIndex(i).IsVisible]
sh = sheets.getByName(target)
cur = sh.createCursor(); cur.gotoEndOfUsedArea(False)
lastc, lastr = cur.RangeAddress.EndColumn, cur.RangeAddress.EndRow
acc = 0
for c in range(lastc + 1):
    acc += px(sh.Columns.getByIndex(c).Width)
    if acc >= MAX_W: lastc = c; break
acc = 0
for r in range(lastr + 1):
    acc += px(sh.Rows.getByIndex(r).Height)
    if acc >= MAX_H: lastr = r; break
rng = sh.getCellRangeByPosition(0, 0, lastc, lastr)
cols = [px(sh.Columns.getByIndex(c).Width) for c in range(lastc + 1)]
rows = [px(sh.Rows.getByIndex(r).Height) for r in range(lastr + 1)]
def_row = px(sh.Rows.getByIndex(min(lastr + 1, 1048575)).Height)
def_col = px(sh.Columns.getByIndex(min(lastc + 1, 16383)).Width)
styles = doc.StyleFamilies.getByName('PageStyles')
st = doc.createInstance('com.sun.star.style.PageStyle'); styles.insertByName('cover', st)
st = styles.getByName('cover')
st.IsLandscape = False
st.Width, st.Height = sum(sh.Columns.getByIndex(c).Width for c in range(lastc + 1)) + 2, sum(sh.Rows.getByIndex(r).Height for r in range(lastr + 1)) + 2
for k in ('LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin', 'HeaderHeight', 'FooterHeight'): setattr(st, k, 0)
st.HeaderIsOn = st.FooterIsOn = False
st.PageScale = 100; st.ScaleToPages = 0; st.PrintGrid = False; st.PrintHeaders = False
sh.PageStyle = 'cover'
sh.setPrintAreas((rng.RangeAddress,))
pdf = os.path.join(tmp, 'sheet.pdf')
fd = uno.Any('[]com.sun.star.beans.PropertyValue', (pv('Selection', rng), pv('ExportNotes', False)))
doc.storeToURL('file://' + pdf, (pv('FilterName', 'calc_pdf_Export'), pv('FilterData', fd)))
doc.close(True)
try: desktop.terminate()
except Exception: pass
proc.terminate()

subprocess.run(['pdftocairo', '-png', '-transp', '-singlefile', '-r', '192', pdf, os.path.join(tmp, 'page')], check=True, stderr=subprocess.DEVNULL)
im = Image.open(os.path.join(tmp, 'page.png')).convert('RGBA')
q = im.quantize(colors=256, method=Image.FASTOCTREE)
buf = io.BytesIO(); q.save(buf, 'PNG', optimize=True)
data = buf.getvalue()
zoom = 100
try:
    import openpyxl, warnings
    warnings.simplefilter('ignore')
    z = openpyxl.load_workbook(src, read_only=False)[target].sheet_view.zoomScale
    zoom = int(z or 100)
except Exception:
    pass
json.dump({
    'v': 1, 'fileName': os.path.basename(src), 'sheet': target, 'tabs': tabs, 'zoom': zoom,
    'cols': [round(c, 2) for c in cols], 'rows': [round(r, 2) for r in rows],
    'defRow': round(def_row, 2), 'defCol': round(def_col, 2),
    'imgW': round(im.size[0] / 2, 2), 'imgH': round(im.size[1] / 2, 2),
    'image': base64.b64encode(data).decode(),
}, open(out_json, 'w'), ensure_ascii=False)
print('written', out_json, len(data) // 1024, 'KB picture,', len(cols), 'columns,', len(rows), 'rows')
