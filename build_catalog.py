"""Run: python3 build_catalog.py /path/to/published_images.csv /path/to/objects.csv"""
import csv, json, re, sys
from pathlib import Path

csv.field_size_limit(sys.maxsize)  # objects.csv has long provenance fields
UUID = re.compile(r'^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$', re.I)
YEAR = re.compile(r'^-?[0-9]{1,4}$')
rows = {}
with open(sys.argv[1], encoding='utf-8-sig', newline='') as f:
    for r in csv.DictReader(f):
        object_id = r['depictstmsobjectid']
        if r['openaccess'] != '1' or r['viewtype'] != 'primary':
            continue
        if not (object_id.isascii() and object_id.isdigit()) or not UUID.match(r['uuid']):
            continue
        if r['iiifurl'] != 'https://api.nga.gov/iiif/' + r['uuid']:
            continue
        try:
            edge = max(int(r['width']), int(r['height']))
        except ValueError:
            continue
        if edge > 0:
            rows.setdefault(object_id, [r['uuid'], int(object_id), edge])
assert len(rows) > 0
# Append [begin, end, typeIndex, highlightFlags] from objects.csv. Years are null
# when unknown; typeIndex points into `types` (NGA's normalized
# visualbrowserclassification). Flags must match HIGHLIGHTS in handler.mjs:
# 1 = NGA sells a custom print (customprinturl), 2 = on view (locationid).
types, extra = [], {}
with open(sys.argv[2], encoding='utf-8-sig', newline='') as f:
    for r in csv.DictReader(f):
        if r['objectid'] not in rows:
            continue
        begin = end = None
        if YEAR.match(r['beginyear']) and YEAR.match(r['endyear']):
            begin, end = int(r['beginyear']), int(r['endyear'])
            if begin > end:
                begin = end = None
        kind = r['visualbrowserclassification'].strip().lower() or None
        if kind and kind not in types:
            types.append(kind)
        flags = (1 if r['customprinturl'].strip() else 0) | (2 if r['locationid'].strip() else 0)
        extra[r['objectid']] = [begin, end, types.index(kind) if kind else None, flags]
for object_id, row in rows.items():
    row += extra.get(object_id, [None, None, None, 0])
root = Path(__file__).resolve().parent
handler = (root / 'handler.mjs').read_text()
(root / 'worker.mjs').write_text(
    '// NGA open-access catalog snapshot; regenerate with build_catalog.py\n' + handler
    + '\nconst catalog = ' + json.dumps(list(rows.values()), separators=(',', ':'))
    + ';\nconst types = ' + json.dumps(types)
    + ';\nexport default {fetch: request => handle(request, catalog, types)};\n')
print(f'Bundled {len(rows)} distinct artworks')
