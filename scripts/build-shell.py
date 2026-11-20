from pathlib import Path
import re
import json
import shutil

root = Path(__file__).resolve().parents[1]
html = (root / '.private/original-index.html').read_text()
styles = json.loads((root / '.private/selected-styles.json').read_text())
links = []
for original in styles:
    source = original.split('?')[0]
    if not source.startswith('assets/'):
        destination = 'assets/css/' + source.replace('/', '-')
        shutil.copy2(root / source, root / destination)
        source = destination
    links.append(f'  <link rel="stylesheet" href="{source}"/>')
for path in ['assets/js/notification-center/style.css', 'assets/js/notification-center/popup/style.css',
             'assets/js/notification-center/popup/sound.css', 'assets/css/standalone.css']:
    links.append(f'  <link rel="stylesheet" href="{path}"/>')
scripts = re.findall(r'<script[^>]*src="([^"]+)"[^>]*></script>', html)
allowed = ['leaflet.js', 'xlsx.full.min.js', 'lucide.min.js', 'local-map.js', 'map-label-position.js',
           'digital-map.js', 'digital-map-labels.js', 'form-required-feedback.js', 'searchable-unit-select.js']
selected = [src.split('?')[0] for src in scripts if '/daily-report' in src or '/notification-center/' in src
            or src.split('?')[0].split('/')[-1] in allowed]
selected = list(dict.fromkeys(selected))
for script in selected:
    if not (root / script).exists():
        raise RuntimeError('Missing asset: ' + script)
nav = html[html.index('        <div class="nav-group user-module" id="dailyReportNavGroup"'):
           html.index('        <div class="nav-group user-module" id="dailyReportNavGroup"') + 6000]
nav = nav[:nav.index('\n        </div>') + len('\n        </div>')]
nav = nav.replace('aria-expanded="false"', 'aria-expanded="true"')
nav = nav.replace('class="nav-group user-module"', 'class="nav-group user-module open"')
report = html[html.index('      <section id="dailyReports"'):html.index('      <section id="permissions"')]
map_section = html[html.index('      <section id="digitalMap"'):html.index('      <section id="nq57Meeting"')]
map_section = map_section.replace('type="checkbox" checked', 'type="checkbox"')
page = '''<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>BCNPV01 · Báo cáo ngày & Bản đồ số</title>
  <link rel="icon" href="assets/img/huy-hieu-cand.png"/>
''' + '\n'.join(links) + '''
</head>
<body class="bcn-standalone">
  <section id="loginScreen" class="bcn-login">
    <div class="bcn-login-brand">
      <img src="assets/img/huy-hieu-cand.png" alt="Huy hiệu Công an nhân dân"/>
      <span>PHÒNG THAM MƯU · PV01</span>
      <h1>BCNPV01</h1>
      <p>Báo cáo ngày & Bản đồ số</p>
      <div class="bcn-login-lines"><span>TIẾP NHẬN</span><span>TỔNG HỢP</span><span>THEO DÕI ĐỊA BÀN</span></div>
    </div>
    <form id="loginForm" class="bcn-login-form">
      <span class="bcn-eyebrow">KHÔNG GIAN NGHIỆP VỤ</span>
      <h2>Đăng nhập hệ thống</h2>
      <p>Sử dụng tài khoản đã được quản trị viên cấp.</p>
      <label>Tên đăng nhập<input id="loginAccount" name="username" autocomplete="username" required/></label>
      <label>Mật khẩu<input id="loginPassword" name="password" type="password"
        autocomplete="current-password" required/></label>
      <p id="loginError" class="bcn-error" role="alert"></p>
      <button class="primary" type="submit">Đăng nhập <span aria-hidden="true">→</span></button>
      <small>Quyền truy cập được áp dụng theo tài khoản và đơn vị công tác.</small>
    </form>
  </section>
  <div id="appShell" class="bcn-layout" hidden>
    <aside class="sidebar" id="sidebar">
      <a class="bcn-brand" href="#home"><img src="assets/img/huy-hieu-cand.png" alt=""/>
        <span><b>BCNPV01</b><small>Báo cáo & địa bàn</small></span></a>
      <nav class="nav">
        <button class="nav-item" data-page="home"><i data-lucide="layout-dashboard"></i>Tổng quan</button>
''' + nav + '''
        <button class="nav-item" data-page="digitalMap" data-admin><i data-lucide="map-pinned"></i>Bản đồ số</button>
        <span class="bcn-nav-caption" data-admin>QUẢN TRỊ</span>
        <button class="nav-item" data-page="accounts" data-admin><i data-lucide="users"></i>Tài khoản & quyền</button>
        <button class="nav-item" data-page="directory" data-admin><i data-lucide="building-2"></i>Danh mục đơn vị</button>
      </nav>
      <div class="bcn-sidebar-foot"><span class="bcn-status-dot"></span>Hệ thống nghiệp vụ PV01</div>
    </aside>
    <main class="main">
      <header class="bcn-topbar">
        <button id="menuToggle" class="ghost" aria-label="Mở menu"><i data-lucide="menu"></i></button>
        <div><span id="pageTitle">Tổng quan</span><small id="accountUnit"></small></div>
        <div class="userbox">
          <button id="notificationToggle" class="ghost" aria-label="Thông báo" aria-expanded="false">
            <i data-lucide="globe"></i><b data-notification-badge hidden></b></button>
          <span id="accountName"></span>
          <button id="changePassword" class="ghost" title="Đổi mật khẩu"><i data-lucide="key-round"></i></button>
          <button id="logout" class="ghost">Đăng xuất</button>
        </div>
      </header>
      <section id="home" class="page active"></section>
''' + report + map_section + '''
      <section id="accounts" class="page"></section>
      <section id="directory" class="page"></section>
    </main>
  </div>
  <div id="notificationPanel" role="dialog" aria-labelledby="notificationTitle" hidden></div>
''' + '\n'.join(f'  <script src="{script}"></script>' for script in selected) + '''
  <script type="module" src="assets/js/standalone/app.js"></script>
</body>
</html>
'''
(root / 'index.html').write_text(page)
print('Shell assembled with', len(selected), 'existing scripts and', len(links), 'styles.')
