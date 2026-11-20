import { count, escape, change } from './format.js';

export function domainChart(data, selected = '') {
  const maximum = Math.max(1, ...data.domains.map(item => item.current));
  return [...data.domains].sort((first, second) => second.current - first.current).map(item => `
    <button type="button" class="dash-domain" data-domain="${item.code}" data-direction="${item.direction}"
      data-domain-select="${item.code}" aria-pressed="${item.code === selected}" aria-controls="dashTrendPanel">
      <span class="dash-domain-label"><span class="dash-domain-dot"></span><span>${escape(item.label)}</span>
        <strong>${count(item.current)}</strong></span>
      <span class="dash-domain-bottom"><span class="dash-track">
        <span style="width:${item.current / maximum * 100}%"></span>
        </span>${item.direction === 'unknown'
          ? '<span class="dash-change" title="Chưa có đủ dữ liệu so sánh">Chưa có kỳ nền</span>' : change(item)}</span>
    </button>`).join('');
}
