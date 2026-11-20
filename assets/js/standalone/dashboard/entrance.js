import { number } from './format.js';

const duration = 900;
const sections = '.dash-kpis, .dash-domains, #dashTrendPanel, .unit-work-values';

export function mountDashboardEntrance(content) {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches || !('IntersectionObserver' in window)) return;

  const groups = new Map();
  let frame = 0;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !groups.has(entry.target)) continue;
      observer.unobserve(entry.target);
      entry.target.dataset.dashEntrance = 'playing';
      groups.get(entry.target).start = performance.now();
      if (!frame) frame = requestAnimationFrame(tick);
    }
  });

  function finish(section) {
    for (const [element, group] of groups) {
      if (section && element !== section) continue;
      observer.unobserve(element);
      delete element.dataset.dashEntrance;
      for (const { node } of group.counters) delete node.dataset.countFrame;
      groups.delete(element);
    }
    if (groups.size) return;
    observer.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
    preference.removeEventListener('change', onPreferenceChange);
    content.style.removeProperty('--dash-entry-duration');
  }

  function tick(now) {
    frame = 0;
    let playing = false;
    for (const [element, group] of groups) {
      if (group.start === null) continue;
      const elapsed = Math.max(0, (now - group.start) / duration);
      if (elapsed >= 1 || !element.isConnected) {
        finish(element);
        continue;
      }
      playing = true;
      const progress = 1 - (1 - elapsed) ** 3;
      for (const { node, target, precision } of group.counters) {
        const value = Math.round(target * progress * precision) / precision;
        const text = number(value);
        if (node.dataset.countFrame !== text) node.dataset.countFrame = text;
      }
    }
    if (playing) frame = requestAnimationFrame(tick);
  }

  function onPreferenceChange(event) {
    if (event.matches) finish();
  }

  content.style.setProperty('--dash-entry-duration', duration + 'ms');
  preference.addEventListener('change', onPreferenceChange);
  const targets = content.matches?.(sections) ? [content] : content.querySelectorAll(sections);
  for (const section of targets) {
    const counters = [...section.querySelectorAll('[data-count-to]')].map(node => {
      const target = Number(node.dataset.countTo);
      node.dataset.countFrame = '0';
      return { node, target, precision: Number.isInteger(target) ? 1 : 10 };
    });
    groups.set(section, { counters, start: null });
    section.dataset.dashEntrance = 'ready';
    observer.observe(section);
  }
  return finish;
}
