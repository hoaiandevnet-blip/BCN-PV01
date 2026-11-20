from pathlib import Path
import shutil
import re
import json
import hashlib

root = Path(__file__).resolve().parents[2]
target = root / 'BCNPV01'
html = (root / 'index.html').read_text()
paths = set()
for pattern in ['assets/js/daily-report*', 'assets/css/daily-report*', 'assets/js/digital-map*',
                'assets/css/digital-map*', 'docs/BCN*', 'docs/bcn*', 'tests/daily-reports*.test.mjs']:
    for item in root.glob(pattern):
        paths.add(item.relative_to(root).as_posix())
paths.update(['server/daily-reports', 'server/digital-map.js', 'server/map-tiles.js',
              'server/session-auth.js', 'server/data/legal', 'assets/data', 'assets/geo',
              'assets/fonts', 'assets/img', 'assets/map-tiles', 'assets/js/leaflet.js',
              'assets/js/local-map.js', 'assets/js/map-label-position.js', 'assets/js/xlsx.full.min.js',
              'assets/js/lucide.min.js', 'assets/js/notification-center', 'assets/js/form-required-feedback.js',
              'assets/js/searchable-unit-select.js', 'assets/css/leaflet.css', 'assets/css/local-fonts.css',
              'assets/css/style.css', 'assets/css/searchable-unit-select.css'])
links = re.findall(r'<link[^>]*href="([^"]+)"[^>]*>', html)
styles = [link for link in links if any(word in link for word in ['daily-report', 'bcn-',
          'local-fonts', 'leaflet.css', '/style.css', 'digital-map', 'searchable-unit-select',
          'notification-center'])]
for link in styles:
    paths.add(link.split('?')[0])
for source in sorted(paths):
    old = root / source
    new = target / source
    new.parent.mkdir(parents=True, exist_ok=True)
    if old.is_dir():
        shutil.copytree(old, new, dirs_exist_ok=True)
    else:
        shutil.copy2(old, new)
manifest = []
for source in sorted(paths):
    old = root / source
    entries = old.rglob('*') if old.is_dir() else [old]
    for item in entries:
        if item.is_file():
            manifest.append({'path': item.relative_to(root).as_posix(),
                             'sha256': hashlib.sha256(item.read_bytes()).hexdigest()})
(target / 'docs/source-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
(target / '.private/original-index.html').write_text(html)
(target / '.private/selected-styles.json').write_text(json.dumps(styles, ensure_ascii=False))
print(f'Copied {len(manifest)} existing files; no source files removed.')
