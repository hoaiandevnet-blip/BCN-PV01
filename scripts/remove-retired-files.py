from pathlib import Path
import json
import shutil

root = Path(__file__).resolve().parents[2]
app = root / 'BCNPV01'
audit = json.loads((app / 'outputs/retirement.json').read_text())
verification = json.loads((app / 'outputs/verification.json').read_text())
assert audit['identityVerified'] and verification['status'] == 'PASS'
paths = set()
for pattern in ['assets/js/daily-report*', 'assets/css/daily-report*', 'assets/js/digital-map*',
                'assets/css/digital-map*', 'assets/js/smart-meeting*', 'assets/css/smart-meeting*',
                'daily-report-*', 'outputs/daily-reports*']:
    paths.update(root.glob(pattern))
paths.update(root / item for item in ['server/daily-reports', 'server/digital-map.js',
    'server/smart-meeting-routes.js', 'server/.meeting-data', 'assets/js/dashboard-report-units.js',
    '.daily-report-files'])
removed = []
for item in sorted(paths):
    if not item.exists():
        continue
    assert item.is_relative_to(root) and not item.is_relative_to(app)
    removed.append(str(item.relative_to(root)))
    if item.is_dir():
        shutil.rmtree(item)
    else:
        item.unlink()
(app / 'outputs/removed-files.json').write_text(json.dumps(removed, ensure_ascii=False, indent=2))
print('Removed', len(removed), 'retired module paths; shared camera map resources retained.')
