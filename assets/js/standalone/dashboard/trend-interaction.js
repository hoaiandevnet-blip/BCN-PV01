import { trendSvg } from './trend-svg.js';
import { trendTooltip } from './trend-panel.js';

export function mountTrendChart(root, data) {
  const plot = root.querySelector('[data-trend-plot]');
  const canvas = plot.querySelector('[data-trend-canvas]');
  const tooltip = plot.querySelector('.dash-trend-tooltip');
  const listeners = new AbortController();
  let active = null;
  let pinned = null;
  let keyboard = data.series.length - 1;
  let size = '';
  const listen = (element, event, handler) => element.addEventListener(event, handler, { signal: listeners.signal });
  const target = event => event.target.closest?.('[data-trend-point]');
  function hide() {
    tooltip.hidden = true;
    active = null;
    plot.querySelectorAll('.is-active').forEach(item => item.classList.remove('is-active'));
  }
  function show(index) {
    if (!data.series[index]) return;
    active = index;
    plot.querySelectorAll('[data-column]').forEach(item => {
      item.classList.toggle('is-active', Number(item.dataset.column) === index);
    });
    tooltip.innerHTML = trendTooltip(data.series[index]);
    tooltip.hidden = false;
    const bounds = plot.getBoundingClientRect();
    const bar = plot.querySelector(`[data-trend-point="${index}"]`).getBoundingClientRect();
    const center = bar.left - bounds.left + bar.width / 2;
    const toRight = center + 14;
    const x = toRight + tooltip.offsetWidth <= bounds.width - 8 ? toRight : center - tooltip.offsetWidth - 14;
    tooltip.style.left = Math.max(8, Math.min(x, bounds.width - tooltip.offsetWidth - 8)) + 'px';
    tooltip.style.top = '8px';
  }
  function draw() {
    const width = Math.floor(plot.clientWidth);
    const height = Math.floor(plot.clientHeight);
    if (!width || !height || size === `${width}:${height}`) return;
    size = `${width}:${height}`;
    const focused = canvas.contains(document.activeElement);
    canvas.innerHTML = trendSvg(data, width, height);
    const point = canvas.querySelector(`[data-trend-point="${keyboard}"]`);
    canvas.querySelectorAll('[data-trend-point]').forEach(item => item.setAttribute('tabindex', '-1'));
    point.setAttribute('tabindex', '0');
    if (focused) point.focus({ preventScroll: true });
    if (active !== null) show(active);
  }
  listen(plot, 'pointermove', event => {
    const point = target(event);
    if (point && event.pointerType !== 'touch' && pinned === null) show(Number(point.dataset.trendPoint));
  });
  listen(plot, 'pointerleave', () => {
    if (pinned === null && !canvas.contains(document.activeElement)) hide();
  });
  listen(plot, 'focusin', event => {
    const point = target(event);
    if (point) {
      keyboard = Number(point.dataset.trendPoint);
      canvas.querySelectorAll('[data-trend-point]').forEach(item => {
        item.setAttribute('tabindex', item === point ? '0' : '-1');
      });
      show(keyboard);
    }
  });
  listen(plot, 'focusout', event => {
    if (!plot.contains(event.relatedTarget) && pinned === null) hide();
  });
  listen(plot, 'click', event => {
    const point = target(event);
    if (!point) return;
    const index = Number(point.dataset.trendPoint);
    pinned = pinned === index ? null : index;
    if (pinned === null) hide();
    else show(index);
  });
  listen(plot, 'keydown', event => {
    const point = target(event);
    if (!point) return;
    const index = Number(point.dataset.trendPoint);
    const next = { ArrowLeft: Math.max(0, index - 1), ArrowRight: Math.min(data.series.length - 1, index + 1),
      Home: 0, End: data.series.length - 1 }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      pinned = null;
      canvas.querySelector(`[data-trend-point="${next}"]`).focus({ preventScroll: true });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      pinned = null;
      hide();
    } else if (['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      point.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  listen(document, 'pointerdown', event => {
    if (!plot.contains(event.target)) {
      pinned = null;
      hide();
    }
  });
  const observer = new ResizeObserver(draw);
  observer.observe(plot);
  draw();
  return () => {
    observer.disconnect();
    listeners.abort();
  };
}
