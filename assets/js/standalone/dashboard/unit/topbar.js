import { icon } from '../format.js';

export function mountUnitTopbar() {
  const bar = document.querySelector('.bcn-topbar');
  const name = document.getElementById('accountUnit');
  const context = name.parentElement;
  const original = name.textContent;
  const emblem = document.createElement('span');
  emblem.className = 'unit-topbar-icon';
  emblem.setAttribute('aria-hidden', 'true');
  emblem.innerHTML = icon('building-2');
  const status = document.createElement('span');
  status.className = 'unit-topbar-status';
  status.innerHTML = icon('shield-check') + '<span>Sẵn sàng báo cáo</span>';

  function reset() {
    delete bar.dataset.unitDashboard;
    name.textContent = original;
    name.removeAttribute('role');
    name.removeAttribute('aria-level');
    name.removeAttribute('title');
    emblem.remove();
    status.remove();
  }

  return {
    reset,
    update(unit) {
      if (!unit) return reset();
      bar.dataset.unitDashboard = 'true';
      name.textContent = unit.name;
      name.title = unit.name;
      name.setAttribute('role', 'heading');
      name.setAttribute('aria-level', '1');
      emblem.title = unit.group === 'XA_PHUONG' ? 'Công an xã / phường' : 'Đơn vị báo cáo';
      context.prepend(emblem);
      context.append(status);
      window.lucide?.createIcons({ root: context });
    }
  };
}
