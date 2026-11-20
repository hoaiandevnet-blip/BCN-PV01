(() => {
  'use strict';

  const text = value => String(value ?? '').trim();
  const ui = () => window.DailyReportsUI;
  const escape = value => ui().escape(value);
  const number = value => {
    if (value === null || value === undefined || text(value) === '') return 'Chưa nhập';
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric.toLocaleString('vi-VN') : 'Chưa nhập';
  };
  const birth = person => {
    const year = text(person.birth_year);
    if (!year) return '';
    const month = text(person.birth_month);
    const day = text(person.birth_day);
    if (month && day) return `Sinh ${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    if (month) return `Sinh tháng ${month}/${year}`;
    return `Sinh năm ${year}`;
  };
  const address = (person, kind) => text(person[`${kind}_address`])
    || ['detail', 'ward', 'province'].map(part => text(person[`${kind}_${part}`])).filter(Boolean).join(', ');

  function subjectRecords(info) {
    const names = Array.isArray(info.subjects) ? info.subjects : [];
    const details = Array.isArray(info.subject_details) ? info.subject_details : [];
    if (!Array.isArray(info.subjects) && !Array.isArray(info.subject_details)) return null;
    return Array.from({ length: Math.max(names.length, details.length) }, (_, index) => ({
      ...(details[index] || {}), name: text(details[index]?.name) || text(names[index])
    }));
  }

  function subjectRow(person, index) {
    const gender = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' }[person.gender];
    const identity = [gender, birth(person), person.identity_number ? `CCCD ${person.identity_number}` : '']
      .filter(Boolean).map(value => `<span>${escape(value)}</span>`).join('');
    const permanent = address(person, 'permanent');
    const current = address(person, 'current');
    const locations = current && current === permanent
      ? [['Thường trú và nơi ở hiện tại', current]]
      : [['Thường trú', permanent], ['Nơi ở hiện tại', current]].filter(([, value]) => value);
    return `<li class="bcn-incident-subject">
      <span class="bcn-incident-person-number" aria-hidden="true">${index + 1}</span>
      <div class="bcn-incident-person-content">
        <p class="bcn-incident-person-name"><strong>${escape(person.name || 'Chưa nhập họ tên')}</strong></p>
        <div class="bcn-incident-person-meta">${identity || '<span>Chưa nhập thông tin nhân thân</span>'}</div>
        ${locations.length ? `<dl class="bcn-incident-person-locations">${locations.map(([label, value]) =>
          `<div class="bcn-incident-person-address"><dt>${label}:</dt><dd>${escape(value)}</dd></div>`
        ).join('')}</dl>` : ''}
      </div></li>`;
  }

  function renderCase(item, index = 0, { preview = false } = {}) {
    const info = item.reference_info || {};
    const people = subjectRecords(info);
    const title = text(item.title) || text(info.title) || 'Chưa nhập tên vụ việc';
    const damage = number(info.property_damage);
    const metrics = [
      ['subjects', 'Số đối tượng', people === null ? 'Chưa nhập' : number(people.length)],
      ['deaths', 'Người chết', number(info.death_count)],
      ['injured', 'Bị thương', number(info.injured_count)],
      ['damage', 'Tài sản thiệt hại', damage === 'Chưa nhập' ? damage : `${damage} đồng`]
    ];
    const subjects = people?.length
      ? `<ol class="bcn-incident-subjects">${people.map(subjectRow).join('')}</ol>`
      : `<p class="bcn-incident-empty">${people === null ? 'Chưa nhập thông tin đối tượng.' : 'Không có đối tượng.'}</p>`;
    const domain = ui().canonicalBusinessCode(item.business_code) || 'KHAC';
    return `<article class="bcn-incident-summary-card" data-incident-id="${escape(item.id)}"
      data-domain="${escape(domain)}">
      <header class="bcn-incident-card-header">
        <div class="bcn-incident-heading-copy">
          <div class="bcn-incident-summary-badges">${ui().categoryBadge(item.business_code)}
            <span class="bcn-incident-number">Vụ việc ${String(index + 1).padStart(2, '0')}</span>
          </div><h4 class="bcn-incident-summary-title">${escape(title)}</h4>
          <p class="bcn-incident-stage"><i data-lucide="git-pull-request" aria-hidden="true"></i>
            ${escape(info.incident_status || 'Chưa nhập trạng thái vụ việc')}</p>
        </div>
        ${preview ? '' : `<button type="button" class="ghost bcn-incident-view" data-incident-preview="${escape(item.id)}"
          aria-label="Xem chi tiết: ${escape(title)}"><i data-lucide="eye" aria-hidden="true"></i>Xem chi tiết</button>`}
      </header>
      <dl class="bcn-incident-facts">${metrics.map(([key, label, value]) =>
        `<div data-incident-fact="${key}"><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
      <div class="bcn-incident-card-body">
        <section class="bcn-incident-people" aria-label="Thông tin đối tượng">
          <h5><i data-lucide="users-round" aria-hidden="true"></i>Thông tin đối tượng</h5>${subjects}
        </section>
        <section class="bcn-incident-evidence"><h5><i data-lucide="package-search" aria-hidden="true"></i>Vật chứng</h5>
          <p>${escape(text(info.evidence) || 'Chưa nhập thông tin vật chứng.')}</p>
        </section>
      </div>
      <footer class="bcn-incident-card-footer">${ui().status(item.current_state || 'PENDING_REVIEW')}
        <span><i data-lucide="lock-keyhole" aria-hidden="true"></i>Chỉ xem</span></footer>
    </article>`;
  }

  function render(cases) {
    const order = Object.keys(ui().domains);
    const rank = item => {
      const index = order.indexOf(ui().canonicalBusinessCode(item.business_code));
      return index < 0 ? order.length : index;
    };
    const groups = new Map();
    [...cases].sort((first, second) => rank(first) - rank(second)).forEach(item => {
      const code = ui().canonicalBusinessCode(item.business_code) || 'KHAC';
      if (!groups.has(code)) groups.set(code, []);
      groups.get(code).push(item);
    });
    let index = 0;
    return [...groups].map(([code, items]) => `<section class="bcn-incident-domain" data-domain="${escape(code)}">
      <header class="bcn-incident-domain-heading"><h5>${escape(ui().domainName(code) || code)}</h5>
        <span>${items.length} vụ việc</span></header>
      <div class="bcn-incident-domain-cases">${items.map(item => renderCase(item, index++)).join('')}</div>
    </section>`).join('');
  }

  window.DailyReportIncidentSummary = { render, renderCase };
})();
