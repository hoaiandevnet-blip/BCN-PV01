import { trendCurve } from './trend-curve.js';

export const trendClearance = 32;

function guideShoulder(run, spacing, barWidth) {
  const largestRise = Math.max(...run.slice(1).map((point, index) => Math.abs(point.y - run[index].y)));
  // A cubic with flat tangents has y(t) = y0 + (y1 - y0) * (3t² - 2t³).
  // Solve the widest transition that leaves at least 12px above each column edge.
  const budget = trendClearance - 12;
  let lower = 0;
  let upper = barWidth / (2 * spacing);
  for (let index = 0; index < 24; index += 1) {
    const middle = (lower + upper) / 2;
    const excursion = largestRise * (3 * middle ** 2 - 2 * middle ** 3);
    if (excursion <= budget) lower = middle;
    else upper = middle;
  }
  return Math.max(0, (barWidth / 2 - lower * spacing) / (1 - 2 * lower));
}

export function currentTrend(series, horizontal, vertical, barWidth) {
  const spacing = Math.abs(horizontal(1) - horizontal(0));
  const runs = [];
  let points = [];
  for (const [index, point] of series.entries()) {
    if (point.hasCurrent) {
      points.push({ x: horizontal(index), y: vertical(point.current), index });
    } else if (points.length) {
      runs.push(points);
      points = [];
    }
  }
  if (points.length) runs.push(points);
  const paths = runs.filter(run => run.length > 1).map(run => {
    const shoulder = guideShoulder(run, spacing, barWidth);
    const guide = shoulder < .001 ? run.map(point => [point.x, point.y - trendClearance])
      : run.flatMap((point, index) => [
      [point.x - (index ? shoulder : 0), point.y - trendClearance],
      [point.x + (index < run.length - 1 ? shoulder : 0), point.y - trendClearance]
    ]);
    const path = trendCurve(guide, true);
    const stems = run.map(point => `<line class="dash-trend-current-stem" data-trend-stem="${point.index}"
      x1="${point.x}" x2="${point.x}" y1="${point.y - trendClearance + 4}" y2="${point.y - 3}"/>`).join('');
    const lastPoint = run[run.length - 1];
    return `<g class="dash-trend-run">
      ${stems}
      <path class="dash-trend-current-outline" d="${path}"/>
      <path class="dash-trend-current" data-trend-current d="${path}"
        marker-end="url(#dashTrendCurrentArrow)"/>
      <path class="dash-trend-flow" d="${path}" pathLength="100"/>
      <circle class="dash-trend-current-start"
        cx="${run[0].x}" cy="${run[0].y - trendClearance}" r="3"/>
      <circle class="dash-trend-tip-pulse"
        cx="${lastPoint.x}" cy="${lastPoint.y - trendClearance}" r="5"/>
      <circle class="dash-trend-tip-beacon"
        cx="${lastPoint.x}" cy="${lastPoint.y - trendClearance}" r="2.5"/>
    </g>`;
  }).join('');
  if (!paths) return '';
  const arrowSize = Math.max(10, Math.min(14, spacing / 2));
  return `<defs>
    <linearGradient id="dashTrendCurrentStroke" gradientUnits="userSpaceOnUse"
      x1="${horizontal(0)}" x2="${horizontal(series.length - 1)}" y1="0" y2="0">
      <stop class="dash-trend-line-origin" offset="0"/>
      <stop class="dash-trend-line-mid" offset="0.6"/>
      <stop class="dash-trend-line-tip" offset="1"/>
    </linearGradient>
    <marker id="dashTrendCurrentArrow" viewBox="0 0 16 16" refX="11" refY="8"
      markerWidth="${arrowSize}" markerHeight="${arrowSize}" markerUnits="userSpaceOnUse" orient="auto">
      <path class="dash-trend-current-arrow" d="M 3 3 L 12 8 L 3 13 C 5 9.8 5 6.2 3 3 Z"/>
    </marker></defs>${paths}`;
}
