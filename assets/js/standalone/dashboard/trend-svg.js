import { date, escape, number } from './format.js';
import { trendLevels } from './trend-levels.js';
import { currentTrend, trendClearance } from './trend-current.js';

const compact = value => new Intl.NumberFormat('vi-VN', {
  notation: 'compact', maximumFractionDigits: 1
}).format(value);

export function trendSvg(data, width, height) {
  const points = data.series;
  const levels = trendLevels(points);
  const left = width < 380 ? 30 : 40;
  const right = 12;
  const top = 32 + trendClearance;
  const bottom = height - 38;
  const step = (width - left - right) / points.length;
  const barWidth = Math.min(44, step * .52);
  const peak = Math.max(1, ...points.flatMap(point => [
    point.hasCurrent ? point.current : 0, point.hasPrevious ? point.previous : 0
  ]));
  const roughTick = peak / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughTick));
  const tick = Math.max(1, [1, 2, 5, 10].find(value => value * magnitude >= roughTick) * magnitude);
  const ceiling = Math.ceil(peak / tick) * tick;
  const vertical = value => bottom - value / ceiling * (bottom - top);
  const horizontal = index => left + step * (index + .5);
  const ticks = Array.from({ length: Math.round(ceiling / tick) + 1 }, (_, index) => {
    const value = index * tick;
    const y = vertical(value);
    return `<line class="dash-trend-grid ${index ? '' : 'is-zero'}" x1="${left}" x2="${width - right}"
      y1="${y}" y2="${y}"/><text class="dash-trend-axis" x="${left - 8}" y="${y + 4}"
      text-anchor="end">${compact(value)}</text>`;
  }).join('');
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor((width - left) / 48))));
  const bars = points.map((point, index) => {
    const x = horizontal(index);
    const y = vertical(point.current);
    const barHeight = bottom - y;
    const radius = Math.min(5, barWidth / 3, barHeight / 2);
    const shape = `M ${x - barWidth / 2} ${bottom}
      V ${y + radius} Q ${x - barWidth / 2} ${y} ${x - barWidth / 2 + radius} ${y}
      H ${x + barWidth / 2 - radius} Q ${x + barWidth / 2} ${y} ${x + barWidth / 2} ${y + radius}
      V ${bottom} Z`;
    const direction = !point.hasCurrent || !point.hasPrevious || point.current === point.previous ? 'flat'
      : point.current > point.previous ? 'up' : 'down';
    const level = levels.forPoint(point)?.key || 'missing';
    const selected = point.day === data.day;
    const visibleLabel = index === points.length - 1 || index % labelEvery === 0
      && (points.length - 1 - index >= labelEvery || index === 0);
    const bar = !point.hasCurrent ? `<circle class="dash-trend-missing" cx="${x}" cy="${bottom}" r="2.5"/>`
      : !point.current ? `<line class="dash-trend-zero" x1="${x - barWidth / 2}" x2="${x + barWidth / 2}"
        y1="${bottom}" y2="${bottom}"/>`
        : `<path id="dashTrendBar${index}" class="dash-trend-bar" fill="url(#dashTrendFill${index})"
            stroke="url(#dashTrendEdge${index})" stroke-width="1" d="${shape}"/>
          <path class="dash-trend-reflection" fill="url(#dashTrendReflection${index})"
            d="${shape}" pointer-events="none"/>
          <clipPath id="dashTrendClip${index}"><use href="#dashTrendBar${index}"/></clipPath>
          <g clip-path="url(#dashTrendClip${index})" pointer-events="none">
            <rect class="dash-column-sweep" x="${x - barWidth / 2}" y="${y}"
              width="${barWidth}" height="${barHeight}" fill="url(#dashColumnSweep)"/>
          </g>`;
    return `<g class="dash-trend-column ${selected ? 'is-selected' : ''}" data-column="${index}"
      data-direction="${direction}" data-level="${level}"
      style="--dash-col-index:${index}; --dash-col-total:${points.length}; --dash-flow-phase:${index % 7}">
      <defs><linearGradient id="dashTrendFill${index}" x1="0" y1="0" x2="0" y2="1">
        <stop class="dash-trend-stop dash-trend-glass-top" offset="0" stop-opacity=".66"/>
        <stop class="dash-trend-stop" offset=".35" stop-opacity=".38"/>
        <stop class="dash-trend-stop dash-trend-glass-base" offset="1" stop-opacity=".12"/>
      </linearGradient>
      <linearGradient id="dashTrendReflection${index}" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="white" stop-opacity=".1"/>
        <stop offset=".6" stop-color="white" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="dashTrendEdge${index}" x1="0" y1="0" x2="0" y2="1">
        <stop class="dash-trend-stop" stop-opacity=".95"/>
        <stop class="dash-trend-stop" offset=".35" stop-opacity=".45"/>
        <stop class="dash-trend-stop" offset="1" stop-opacity=".12"/>
      </linearGradient></defs>
      <rect class="dash-trend-band" x="${x - step * .43}" y="${top - 17}" width="${step * .86}"
        height="${bottom - top + 18}" rx="6"/>
      ${bar}
      ${visibleLabel ? `<text class="dash-trend-axis ${selected ? 'is-selected' : ''}" x="${x}"
        y="${height - 12}" text-anchor="middle">${date(point.day).slice(0, 5)}</text>` : ''}</g>`;
  }).join('');
  const baseline = points.map((point, index) => {
    if (!point.hasPrevious) return '';
    const prior = points[index - 1];
    const currentX = horizontal(index);
    const currentY = vertical(point.previous);
    const previousX = horizontal(index - 1);
    const previousY = prior?.hasPrevious ? vertical(prior.previous) : currentY;
    const middleX = (previousX + currentX) / 2;
    // Horizontal tangents join smoothly; control points stay within the two observed values.
    const path = `M ${previousX} ${previousY} C ${middleX} ${previousY}, `
      + `${middleX} ${currentY}, ${currentX} ${currentY}`;
    return `${prior?.hasPrevious ? `<path class="dash-trend-reference" d="${path}"/>` : ''}
      <circle class="dash-trend-reference-dot" cx="${currentX}" cy="${currentY}" r="4"/>`;
  }).join('');
  // Paint labels last so neither the guide stems nor comparison line obscure the numbers.
  const values = points.map((point, index) => point.hasCurrent
    && (points.length <= 7 || point.day === data.day) ? `<text class="dash-trend-value"
      x="${horizontal(index)}" y="${vertical(point.current) - 10}"
      text-anchor="middle">${compact(point.current)}</text>` : '').join('');
  const targets = points.map((point, index) => {
    const label = `${date(point.day)}: ${point.hasCurrent ? number(point.current) + ' vụ' : 'chưa có báo cáo'}; `
      + `${date(point.previousDay)}: ${point.hasPrevious ? number(point.previous) + ' vụ' : 'chưa có báo cáo'}`;
    return `<g data-trend-point="${index}" role="button" tabindex="${index === points.length - 1 ? 0 : -1}"
      aria-label="${escape(label)}" aria-describedby="dashTrendHelp">
      <rect class="dash-trend-hit" x="${left + index * step}" y="0" width="${step}"
        height="${height}"/></g>`;
  }).join('');
  return `<svg class="dash-trend-svg" viewBox="0 0 ${width} ${height}"
    role="group" aria-label="Biểu đồ số vụ việc từng ngày và ngày đối chiếu">
    <defs><linearGradient id="dashColumnSweep" x1="0" y1="0" x2=".14" y2="1">
      <stop offset=".12" stop-opacity="0"/>
      <stop offset=".5" stop-opacity=".45"/>
      <stop offset=".88" stop-opacity="0"/>
    </linearGradient></defs>
    <g aria-hidden="true">${ticks}${bars}${currentTrend(points, horizontal, vertical, barWidth)}
      ${baseline}${values}</g>${targets}</svg>`;
}
