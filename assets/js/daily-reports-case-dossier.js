(() => {
  'use strict';

  const ui = () => window.DailyReportsUI;
  const escape = value => ui().escape(value);
  const text = value => escape(String(value ?? '').trim() || 'Chưa nhập');
  const date = value => value ? ui().date(value) : 'Chưa nhập';
  const fact = (label, value, wide = false) => `<div${wide ? ' class="bcn-dossier-wide"' : ''}>
    <dt>${label}</dt><dd>${value}</dd></div>`;
  const section = (id, title, body) => `<section id="${id}" class="bcn-detail-section bcn-dossier-section"
    tabindex="-1"><h4>${title}</h4>${body}</section>`;

  function handling(info) {
    const details = info.handling_details || {};
    const hasValue = value => value != null && String(value).trim() !== '';
    const group = (title, fields, name) => {
      const rows = fields.filter(([, value]) => hasValue(value));
      if (!rows.length) return '';
      const symbol = name === 'decision' ? 'file-badge' : 'clipboard-check';
      return `<section class="bcn-handling-group bcn-handling-${name}">
        <h5><i data-lucide="${symbol}" aria-hidden="true"></i>${title}</h5>
        <dl>${rows.map(([label, value]) => fact(label, label === 'Số quyết định'
          ? `<strong class="bcn-handling-decision-number">${text(value)}</strong>` : text(value))).join('')}</dl>
      </section>`;
    };
    const status = String(info.handling_result ?? '').trim();
    const tone = status === 'Đã giải quyết' ? 'resolved' : status === 'Đang giải quyết' ? 'pending' : 'neutral';
    const decision = group('Thông tin quyết định', [
      ['Số quyết định', details.prosecution_decision_number],
      ['Ngày quyết định', details.prosecution_date ? date(details.prosecution_date) : ''],
      ['Cơ quan quyết định', details.prosecution_authority]
    ], 'decision');
    const resolution = group('Nội dung giải quyết', [
      ['Kết quả giải quyết', details.resolution],
      ['Lý do', details.reason],
      ['Hình thức chi tiết', details.detail]
    ], 'resolution');
    return `<dl class="bcn-dossier-handling-summary">
      ${fact('Trạng thái xử lý', `<span class="bcn-handling-status" data-tone="${tone}">${text(status)}</span>`)}
      ${hasValue(details.form) ? fact('Hình thức xử lý', text(details.form)) : ''}
      </dl>
      ${decision || resolution ? `<div class="bcn-handling-groups">${decision}${resolution}</div>` : ''}
      ${hasValue(details.fine_million) ? `<dl class="bcn-handling-fine">
        ${fact('Tổng tiền phạt', `${text(details.fine_million)} <span>triệu đồng</span>`)}</dl>` : ''}`;
  }

  function classification(item) {
    const info = item.reference_info || {};
    const types = (info.case_types || []).map(entry => entry.label).filter(Boolean);
    if (!types.length && info.case_type) types.push(info.case_type);
    const laws = types.map(label => {
      const match = String(label).match(/^(Điều\s+\d+[a-zđ]?)(\s*[—–:-]\s*)(.+)$/iu);
      return match ? `<li class="bcn-classification-law"><strong>${text(match[1])}</strong>
        <span>${text(match[2] + match[3])}</span></li>`
        : `<li class="bcn-classification-law bcn-classification-law-plain">${text(label)}</li>`;
    }).join('');
    return `<dl class="bcn-dossier-facts bcn-classification-facts">
      <div class="bcn-classification-domain"><dt><i data-lucide="tags" aria-hidden="true"></i>Lĩnh vực</dt>
        <dd>${ui().caseCategoryBadges(item)}</dd></div>
      <div class="bcn-classification-stage"><dt><i data-lucide="route" aria-hidden="true"></i>
        Trạng thái vụ việc</dt><dd><span class="bcn-case-stage">${text(info.incident_status)}</span></dd></div>
      <div class="bcn-dossier-wide bcn-classification-legal">
        <dt><i data-lucide="scale" aria-hidden="true"></i>Loại vụ việc / Căn cứ pháp lý</dt>
        <dd>${laws ? `<ul class="bcn-classification-laws">${laws}</ul>` : 'Chưa nhập'}</dd></div>
      ${item.external_reference ? fact('Số hồ sơ nguồn', text(item.external_reference), true) : ''}
    </dl>`;
  }

  function render(item, { unitName, handlingUnitName }) {
    const info = item.reference_info;
    const information = `<div class="bcn-information-identity">
      <p class="bcn-dossier-label">Tên vụ việc</p>
      <p class="bcn-dossier-title">${text(item.title)}</p></div>
      <div class="bcn-information-groups">
      <section class="bcn-information-group bcn-information-classification">
        <h5><i data-lucide="tags" aria-hidden="true"></i>Phân loại & căn cứ pháp lý</h5>
        ${classification(item)}
      </section>
      <section class="bcn-information-group bcn-information-agencies">
        <h5><i data-lucide="building-2" aria-hidden="true"></i>Cơ quan phụ trách</h5>
        <dl class="bcn-dossier-facts">
        ${fact('Cơ quan tạo', text(unitName))}
        ${fact('Đơn vị xử lý', text(handlingUnitName))}
        </dl>
      </section>
      <section class="bcn-information-group bcn-information-location">
        <h5><i data-lucide="map-pin" aria-hidden="true"></i>Thời gian & địa điểm</h5>
        <dl class="bcn-dossier-facts">
        ${fact('Thời điểm xảy ra', date(item.occurred_at))}
        ${fact('Thời điểm kết thúc', date(info.ended_at))}
        ${item.location_general ? fact('Địa điểm', text(item.location_general), true) : ''}
        </dl>
      </section>
      <section class="bcn-information-group bcn-information-narrative">
        <h5><i data-lucide="file-text" aria-hidden="true"></i>Nội dung vụ việc</h5>
        <p data-case-summary>${text(item.summary)}</p>
      </section>
      </div>`;
    const subjects = window.DailyReportIncidentSummary.renderCase(item, 0, { preview: true });
    return `<div class="bcn-dossier" data-case-dossier>
      ${section('bcnDetailInformation', 'Thông tin vụ việc', information)}
      ${section('bcnEditPersons', 'Đối tượng, thiệt hại và vật chứng', subjects)}
      ${section('bcnDetailHandling', 'Kết quả xử lý', handling(info))}
    </div>`;
  }

  window.DailyReportsCaseDossier = { render };
})();
