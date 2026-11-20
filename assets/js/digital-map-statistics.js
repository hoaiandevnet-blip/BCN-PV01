(function (root) {
  'use strict';
  const DOMAIN_CODES = {
    'Phạm pháp hình sự': 'PPHS', 'Tệ nạn xã hội': 'TNXH', 'Ma túy': 'MA_TUY',
    'Kinh tế, chức vụ': 'KINH_TE', 'Môi trường': 'MOI_TRUONG', 'An ninh quốc gia': 'ANQG',
    'Công nghệ cao': 'CONG_NGHE_CAO', 'Hoạt động tư pháp': 'HOAT_DONG_TU_PHAP',
    'Tình hình khác': 'TINH_HINH_KHAC'
  };
  const toDomainCode = name => DOMAIN_CODES[name] || 'PPHS';
  const number = value => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  const escape = value => String(value).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const date = value => value.split('-').reverse().join('/');
  const range = (from, to) => (from === to ? date(to) : date(from) + ' – ' + date(to));

  function change(current, previous) {
    if (!previous) return current ? 'Mới phát sinh' : 'Chưa ghi nhận';
    const delta = current - previous;
    if (!delta) return '0%';
    return (delta > 0 ? '+' : '−') + number(Math.abs(delta) * 100 / previous) + '%';
  }

  function collect(rows) {
    const data = { current: 0, previous: 0, mapped: 0, outside: 0, unknown: 0, maximum: 0,
      wards: new Map(), categories: new Map() };
    for (const row of rows) {
      data.current += row.current;
      data.previous += row.previous;
      data[row.area] += row.current;
      data.categories.set(row.category, (data.categories.get(row.category) || 0) + row.current);
      if (row.area !== 'mapped') continue;
      const ward = data.wards.get(row.ward_code) || { name: row.ward_name, code: row.ward_code,
        current: 0, previous: 0, rows: [] };
      ward.current += row.current;
      ward.previous += row.previous;
      ward.rows.push(row);
      data.wards.set(ward.code, ward);
      data.maximum = Math.max(data.maximum, ward.current);
    }
    return data;
  }

  function comparison(current, previous) {
    const delta = current - previous;
    if (!delta) return previous ? 'Không đổi · 0%' : 'Chưa ghi nhận vụ';
    const difference = (delta > 0 ? 'Tăng ' : 'Giảm ') + number(Math.abs(delta)) + ' vụ';
    return previous ? difference + ' (' + change(current, previous) + ')' : difference;
  }

  let rankingExpanded = false;

  function paint({ stats, period, wardCount, mode, selectedCode }) {
    const el = id => document.getElementById(id);
    const active = [...stats.wards.values()].filter(ward => ward.current > 0);
    const ranks = mode === 'change'
      ? [...stats.wards.values()].filter(ward => ward.current || ward.previous) : active;
    ranks.sort((a, b) => b.current - a.current || a.name.localeCompare(b.name, 'vi'));

    const delta = stats.current - stats.previous;
    const deltaClass = delta > 0 ? 'trend-up' : delta < 0 ? 'trend-down' : 'trend-flat';
    const deltaIcon = delta > 0 ? 'trending-up' : delta < 0 ? 'trending-down' : 'minus';
    const compText = comparison(stats.current, stats.previous);
    const percent = stats.current ? number(100 * stats.mapped / stats.current) + '%' : '—';
    const mapPercent = stats.current
      ? Math.min(100, Math.round(1000 * stats.mapped / stats.current) / 10) : 0;
    const wardPercent = Math.min(100, Math.round(1000 * active.length / wardCount) / 10);
    const coverage = [stats.unknown && number(stats.unknown) + ' vụ chưa xác định địa bàn',
      stats.outside && number(stats.outside) + ' vụ ngoài Đồng Nai'].filter(Boolean).join(' · ');

    el('digitalMapUpdated').textContent = 'Kỳ ' + range(period.from, period.to)
      + ' · Đối chiếu ' + range(period.previousFrom, period.previousTo);

    const metric = (label, value, detail, icon, barPercent, barClass) => {
      return `<div class="map-sum-card ${barClass ? 'has-bar' : ''}">
        <div class="map-sum-head">
          <span class="map-sum-icon ${barClass || 'icon-cases'}">
            <i data-lucide="${icon}" aria-hidden="true"></i>
          </span>
          <span class="map-sum-label">${label}</span>
        </div>
        <strong>${value}</strong>
        ${barPercent !== undefined ? `<div class="map-sum-progress">
          <div class="map-sum-bar ${barClass || ''}" style="--val:${barPercent}%"></div></div>` : ''}
        <small class="map-sum-detail">${detail}</small>
      </div>`;
    };

    const mappedCoverage = (stats.current ? percent : 'Chưa ghi nhận vụ')
      + (coverage ? ' · ' + coverage : '');
    el('digitalMapSummary').innerHTML = [
      metric('Vụ đã báo cáo', number(stats.current),
        `<span class="map-delta-pill ${deltaClass}"><i data-lucide="${deltaIcon}"></i> ${compText}</span> `
        + `<span class="map-sub-text">Kỳ trước ${number(stats.previous)} vụ · ${compText}</span>`,
        'shield-alert', undefined, 'icon-cases'),
      metric('Vụ đã lên bản đồ', number(stats.mapped) + ' <em>/ ' + number(stats.current) + '</em>',
        `<span class="map-rate-badge">${stats.current ? percent : '—'}</span> `
        + `<span class="map-sub-text">${mappedCoverage}</span>`,
        'map-pinned', mapPercent, 'bar-mapped'),
      metric('Địa bàn có vụ', number(active.length) + ' <em>/ ' + wardCount + '</em>',
        `<span class="map-rate-badge">${number(wardPercent)}%</span> `
        + `<span class="map-sub-text">Phường, xã trong kỳ (${number(active.length)} / ${wardCount})</span>`,
        'building-2', wardPercent, 'bar-wards')
    ].join('');

    const categories = [...stats.categories].filter(([, count]) => count).sort((a, b) => b[1] - a[1]);
    el('digitalMapCharts').innerHTML = categories.map(([name, count]) => {
      const code = toDomainCode(name);
      return `<div class="map-type-row" data-domain="${code}">
        <span>${escape(name)}</span><b>${number(count)} · ${number(100 * count / stats.current)}%</b>
        <i style="--share:${100 * count / stats.current}%"></i></div>`;
    }).join('')
      || '<p>Chưa ghi nhận vụ trong kỳ.</p>';

    const COLLAPSE_LIMIT = 10;
    const shouldShowToggle = ranks.length > COLLAPSE_LIMIT;
    const visibleRanks = (rankingExpanded || !shouldShowToggle)
      ? ranks
      : ranks.slice(0, COLLAPSE_LIMIT);
    const maxRankCount = Math.max(1, ...ranks.map(w => w.current));

    const rankRowsHtml = visibleRanks.map((ward, index) => {
      const changeStr = change(ward.current, ward.previous);
      const isUp = changeStr.startsWith('+');
      const isDown = changeStr.startsWith('−') || changeStr.startsWith('-');
      const isNew = changeStr.includes('Mới');
      const trendClass = isUp ? 'trend-up' : isDown ? 'trend-down' : isNew ? 'trend-new' : 'trend-flat';
      const trendIcon = isUp ? 'trending-up' : isDown ? 'trending-down' : isNew ? 'sparkles' : 'minus';
      const rankBadgeClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : 'plain';
      return `<button type="button" data-digital-ward="${escape(ward.code)}"
        aria-pressed="${ward.code === selectedCode}" class="map-rank-btn">
        <span class="map-rank-name-col">
          <span class="map-rank-pos ${rankBadgeClass}">#${index + 1}</span>
          <span class="map-ward-name">${escape(ward.name)}</span>
        </span>
        <small class="map-trend-pill ${trendClass}">
          <i data-lucide="${trendIcon}" aria-hidden="true"></i>${changeStr}
        </small>
        <strong class="map-rank-val">
          <span>${number(ward.current)}</span>
          <span class="map-rank-mini-bar" style="--ratio:${(ward.current / maxRankCount) * 100}%"></span>
        </strong>
      </button>`;
    }).join('');

    const toggleText = rankingExpanded
      ? `Thu gọn (hiện Top ${COLLAPSE_LIMIT})`
      : `Xem thêm (${ranks.length - COLLAPSE_LIMIT} địa bàn khác)`;
    const toggleIcon = rankingExpanded ? 'chevrons-up' : 'chevrons-down';
    const toggleBtnHtml = shouldShowToggle
      ? `<button type="button" class="map-ranking-toggle-btn" id="mapRankingToggle">
        <i data-lucide="${toggleIcon}" aria-hidden="true"></i><span>${toggleText}</span>
      </button>` : '';

    el('digitalMapRanking').innerHTML = ranks.length
      ? `<header><span>Phường / xã</span><span>So kỳ trước</span><span>Số vụ</span></header>
        ${rankRowsHtml}${toggleBtnHtml}`
      : '<p>Chưa có vụ xác định được địa bàn.</p>';

    if (shouldShowToggle) {
      const toggleBtn = el('mapRankingToggle');
      if (toggleBtn) {
        toggleBtn.onclick = () => {
          rankingExpanded = !rankingExpanded;
          paint({ stats, period, wardCount, mode, selectedCode });
        };
      }
    }

    if (typeof window !== 'undefined' && window.lucide) {
      window.lucide.createIcons({
        root: el('digitalMapSummary'),
        attrs: { 'stroke-width': 1.8, focusable: 'false' }
      });
      window.lucide.createIcons({
        root: el('digitalMapRanking'),
        attrs: { 'stroke-width': 1.8, focusable: 'false' }
      });
    }
  }

  function detail(feature, ward) {
    const current = ward?.current || 0;
    const previous = ward?.previous || 0;
    const breakdown = new Map();
    const statuses = new Map();
    for (const row of ward?.rows || []) {
      if (!row.current) continue;
      breakdown.set(row.category, (breakdown.get(row.category) || 0) + row.current);
      statuses.set(row.status, (statuses.get(row.status) || 0) + row.current);
    }
    const entries = values => [...values].sort((a, b) => b[1] - a[1]);
    const statusLine = entries(statuses).map(([label, value]) =>
      number(value) + ' ' + escape(label.toLowerCase()));
    const compText = comparison(current, previous);
    const delta = current - previous;
    const deltaClass = delta > 0 ? 'trend-up' : delta < 0 ? 'trend-down' : 'trend-flat';
    const catRows = entries(breakdown).map(([name, count]) => {
      const share = current ? Math.min(100, Math.round(100 * count / current)) : 0;
      const code = toDomainCode(name);
      return `<div class="map-ward-cat-row" data-domain="${code}">
        <div class="map-ward-cat-head"><dt>${escape(name)}</dt><dd>${number(count)}</dd></div>
        <div class="map-ward-cat-bar" style="--share:${share}%"></div>
      </div>`;
    }).join('');
    return `<h3 id="mapWardName">${escape(feature.properties.name)}</h3>
      <p class="map-ward-total"><strong>${number(current)}</strong> vụ kỳ này</p>
      <p class="map-ward-comp">Kỳ trước ${number(previous)} vụ · `
      + `<span class="map-delta-pill ${deltaClass}">${compText}</span></p>
      ${statusLine.length ? `<p class="map-ward-status">${statusLine.join(' · ')}</p>` : ''}
      ${breakdown.size ? `<h4>Hệ nghiệp vụ</h4><dl>${catRows}</dl>` : ''}`;
  }

  root.DigitalMapStats = { change, collect, paint, detail };
})(window);
