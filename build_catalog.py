"""Run: python3 build_catalog.py /path/to/published_images.csv"""
import csv, json, sys
from pathlib import Path
rows = {}
with open(sys.argv[1], encoding='utf-8-sig', newline='') as f:
    for r in csv.DictReader(f):
        if r['openaccess'] == '1' and r['viewtype'] == 'primary' and r['depictstmsobjectid'].isdigit():
            if r['iiifurl'] != 'https://api.nga.gov/iiif/' + r['uuid']:
                continue
            rows.setdefault(r['depictstmsobjectid'], [r['uuid'], int(r['depictstmsobjectid']), max(int(r['width']), int(r['height']))])
assert len(rows) > 0
root = Path(__file__).resolve().parent
handler = (root / 'handler.mjs').read_text()
(root / 'worker.mjs').write_text("import {createWorker} from './catalog-refresh.mjs';\n// NGA open-access catalog snapshot; regenerate with build_catalog.py\n" + handler + '\nconst catalog = ' + json.dumps(list(rows.values()), separators=(',', ':')) + ';\nexport default createWorker(handle, catalog);\n')
print(f'Bundled {len(rows)} distinct artworks')
