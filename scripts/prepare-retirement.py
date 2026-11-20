from pathlib import Path
import re
import json
import shutil
import hashlib

project = Path(__file__).resolve().parents[2]
private = project / 'BCNPV01/.private'
stage = private / 'retirement'
backups = private / 'old-source'
manifest = {}

def stage_file(relative, transform):
    source = project / relative
    original = source.read_text()
    updated = transform(original)
    if updated == original:
        raise RuntimeError('No edit: ' + relative)
    for destination, content in [(stage / relative, updated), (backups / relative, original)]:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content)
    manifest[relative] = {'before': hashlib.sha256(original.encode()).hexdigest(),
                          'after': hashlib.sha256(updated.encode()).hexdigest()}

def remove_between(text, start, end, replacement=''):
    first = text.index(start)
    last = text.index(end, first)
    return text[:first] + replacement + text[last:]

def server_edit(text):
    for line in ["import { registerDigitalMapRoutes } from './digital-map.js';",
                 "import { ensureSmartMeetingModule, registerSmartMeetingRoutes } from './smart-meeting-routes.js';",
                 "import { ensureDailyReportSchema } from './daily-reports/schema.js';",
                 "import { registerDailyReportRoutes } from './daily-reports/routes.js';",
                 'registerDigitalMapRoutes(app, { pool, asyncHandler, getActor, logActivity });',
                 'const dailyReports = registerDailyReportRoutes(app, { pool, auth: cameraAuth, requireSameOrigin });',
                 'registerSmartMeetingRoutes(app, { pool, cameraAuth, requireSameOrigin });',
                 '      await ensureDailyReportSchema(pool);',
                 '      await ensureSmartMeetingModule(pool);']:
        assert line in text, line
        text = text.replace(line + '\n', '')
    text = text.replace("const defaultJsonParser = express.json({ limit: '10mb' });\napp.use((req, res, next) => req.path.startsWith('/api/bao-cao-ngay/')\n  ? next() : defaultJsonParser(req, res, next));",
                        "app.use(express.json({ limit: '10mb' }));")
    text = text.replace('sameOrigin: requireSameOrigin,\n  dailyReports: dailyReports.notificationFeed', 'sameOrigin: requireSameOrigin')
    text = remove_between(text, '  await pool.query(`\n    create table if not exists digital_map_periods',
                          '  // Preserve legacy snapshots')
    text = re.sub(r"  await pool.query\(`\n    insert into modules.*?values \('digitalMap'.*?\n  `\);\n", '', text, count=1, flags=re.S) if False else text
    position = text.index("values ('digitalMap'")
    start = text.rfind('  await pool.query(`', 0, position)
    end = text.index('  `);', position) + len('  `);\n')
    text = text[:start] + text[end:]
    text = text.replace("        ('digitalMap', 'Bản đồ số'),\n", '')
    text = text.replace("  if (/^\\/(server\\/bao-ban", "  if (/^\\/BCNPV01(?:\\/|$)/i.test(requestedPath)) {\n    return res.status(404).type('text/plain').send('Not found');\n  }\n  if (/^\\/(server\\/bao-ban")
    return text

def html_edit(text):
    for name in ['dailyReportNavGroup', 'smartMeetingNavGroup']:
        text, count = re.subn(r'        <div[^>]*id="' + name + r'".*?\n        </div>\n', '', text, count=1, flags=re.S)
        assert count == 1, name
    for name in ['dailyReports', 'digitalMap', 'nq57Meeting']:
        text, count = re.subn(r'      <section id="' + name + r'".*?\n      </section>\n', '', text, count=1, flags=re.S)
        assert count == 1, name
    text = '\n'.join(line for line in text.split('\n') if not (
        'data-page="digitalMap"' in line or
        (('<script' in line or '<link' in line) and any(word in line for word in
          ['daily-report', 'digital-map', 'smart-meeting', 'dashboard-report-units.js']))))
    text = text.replace('  <script src="assets/js/dashboard-view.js',
                        '  <link rel="stylesheet" href="assets/css/dashboard-operations.css"/>\n'
                        '  <script src="assets/js/dashboard-operations.js"></script>\n'
                        '  <script src="assets/js/dashboard-view.js')
    text = text.replace('v=20261107-preserve-edits', 'v=20261109-bcnpv01-retired')
    text = text.replace('v=20261105-reports-pv01-dashboard-all-units', 'v=20261109-operations')
    text = text.replace('dashboard.js?v=20261107-pv01-scope-restore', 'dashboard.js?v=20261109-operations')
    return text

def app_edit(text):
    text = remove_between(text, 'const dailyReportViewModules', 'const defaultModuleDefinitions')
    text = re.sub(r"  \{\n    key: 'dailyReports'.*?\n  \},\n", '', text, count=1, flags=re.S)
    text = re.sub(r"  \{\n    key: 'nq57Meeting'.*?\n  \},\n", '', text, count=1, flags=re.S)
    text = '\n'.join(line for line in text.split('\n') if not (
        "{ key: 'digitalMap'" in line or
        re.search(r"^  '[^']+': '(dailyReport\w+|digitalMap|nq57Meeting)'", line)))
    text = remove_between(text, "  if (key === 'dailyReports') {", "  if (key === 'tttcAssetCategories')")
    text = remove_between(text, 'function dailyReportModuleAccess', 'function isAdminUser')
    text = remove_between(text, 'function setSmartMeetingNavExpanded', 'let tttcDetailPage')
    text = text.replace("    canOpenReports: () => canAccessModule('dailyReports') && canAccessModule('dailyReportComposer'),\n", '')
    text = text.replace("    canViewRegistry: () => canAccessModule('dailyReportRegistry'),\n", '')
    text = remove_between(text, '    navigate: async page => {\n      showPage(page);', '    icons: refreshIcons,',
                          '    navigate: page => showPage(page),\n')
    for line in ["  syncGroupVisibility('#smartMeetingNavGroup', '#smartMeetingNavSubmenu .nav-item');",
                 "  if (key === 'nq57Meeting') return getUserPermissionModuleKeys(username).has(key);",
                 '      dailyReports: window.DailyReports,',
                 "  if (page !== 'nq57Meeting') window.SmartMeeting?.deactivate();",
                 "  setSmartMeetingNavExpanded(page === 'nq57Meeting');",
                 "  if (page === 'dailyReports') window.DailyReports?.activate(pageEl);",
                 "    dailyReports: ['Báo cáo ngày', 'Tiếp nhận, rà soát và tổng hợp báo cáo ngày'],",
                 "  if (page === 'digitalMap') window.DigitalMap?.render({ actor: currentUser?.u || '', toast });",
                 "  if (activePage === 'dailyReports') await window.DailyReports?.refreshUnits();"]:
        text = text.replace(line + '\n', '')
    text = re.sub(r"  if \(page !== 'dailyReports'\) \{.*?\n  \}\n", '', text, count=1, flags=re.S)
    text = re.sub(r"  if \(page === 'nq57Meeting'\) \{.*?\n  \}\n", '', text, count=1, flags=re.S)
    text = remove_between(text, '  const dailyReportPermissions = perms.filter',
                          "    || permissionsEmptyState('Chưa có quyền chức năng'",
                          "  $('#permList').innerHTML = perms.map(renderPermission).join('')\n")
    text = re.sub(r"    if \(activePage === 'dailyReports' && btn.dataset.bcnView\) \{.*?\n    \}\n", '', text, count=1, flags=re.S)
    text = remove_between(text, "$('#dailyReportNavToggle')", "$('#staffNavToggle')")
    text = remove_between(text, "$('#smartMeetingNavToggle')", 'const sidebarCollapse')
    return text

def dashboard_edit(text):
    start = text.index('          const [data, reportUnits] = await Promise.all([')
    end = text.index('          return { ...data, reportUnits };', start) + len('          return { ...data, reportUnits };')
    text = text[:start] + '''          return window.DashboardData.load(context.api, {
            admin: context.isAdmin(),
            allUnits: context.canViewAllUnits?.() === true,
            canReadAssets: context.canReadAssets?.() !== false,
            owns: context.owns,
            equipmentEnabled: Boolean(window.TttcEquipment)
          });''' + text[end:]
    text = text.replace('canOpenReports: state.data?.reportUnits?.canOpen === true,', 'canOpenReports: false,')
    return text

stage_file('server/index.js', server_edit)
stage_file('index.html', html_edit)
stage_file('assets/js/app.js', app_edit)
stage_file('assets/js/dashboard.js', dashboard_edit)
stage_file('assets/js/dashboard-view.js', lambda text: text.replace('${p.reportUnits(state.data.reportUnits)}',
    '${window.DashboardOperations.render(summary, state.data)}'))
stage_file('server/ai-assistant/sources.js', lambda text: remove_between(text, '  map_cases: {', '  logs: {'))
(private / 'retirement-manifest.json').write_text(json.dumps(manifest, indent=2))
print('Prepared', len(manifest), 'files. Original system is unchanged.')
