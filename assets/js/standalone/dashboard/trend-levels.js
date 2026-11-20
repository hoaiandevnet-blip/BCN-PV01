import { number } from './format.js';

// Equal portions of the observed range, used only to compare daily report volumes.
export function trendLevels(series) {
  const known = series.filter(point => point.hasCurrent);
  const maximum = Math.max(0, ...known.map(point => point.current));
  let lower = 0;
  const levels = ['low', 'moderate', 'high', 'very-high'].flatMap((key, index) => {
    const upper = Math.floor(maximum * (index + 1) / 4);
    if (upper < lower) return [];
    const level = { key, lower, upper,
      label: lower === upper ? `${number(upper)} vụ` : `${number(lower)}–${number(upper)} vụ` };
    lower = upper + 1;
    return [level];
  });
  return {
    levels: known.length ? levels : [],
    forPoint(point) {
      if (!point.hasCurrent) return null;
      return levels.find(level => point.current >= level.lower && point.current <= level.upper);
    }
  };
}

export function trendLevelLegend(series) {
  const { levels } = trendLevels(series);
  if (!levels.length) return '';
  return `<div class="dash-trend-levels" aria-label="Màu theo mức số vụ trong biểu đồ">
    <span>Mức số vụ</span>${levels.map(level => `<span data-level="${level.key}">
      <i aria-hidden="true"></i>${level.label}</span>`).join('')}</div>`;
}
