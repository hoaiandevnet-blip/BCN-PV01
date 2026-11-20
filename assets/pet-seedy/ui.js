import { spriteUrl } from './animation.js';

const sproutIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"
  stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 21v-9M12 16C5 17 3 13 3 7c6-1 10 2 9 9ZM12 12c-1-6 3-9 9-9 0 6-3 10-9 9Z"/>
</svg>`;

export function createPetView(toolbar) {
  const toggle = document.createElement('button');
  toggle.id = 'bcnPetToggle';
  toggle.className = 'ghost bcn-pet-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'bcnPet');
  toggle.innerHTML = `${sproutIcon}<span class="bcn-pet-toggle-label">Thú cưng Seedy</span>`;
  toolbar.prepend(toggle);
  const mobileSlot = document.createElement('div');
  mobileSlot.className = 'bcn-pet-mobile-slot';
  document.querySelector('#sidebar .nav').append(mobileSlot);

  const root = document.createElement('aside');
  root.id = 'bcnPet';
  root.className = 'bcn-pet';
  root.hidden = true;
  root.setAttribute('aria-label', 'Thú cưng Seedy');
  root.innerHTML = `
    <button class="bcn-pet-character" type="button" aria-label="Trò chuyện với Seedy"
      aria-describedby="bcnPetHelp" title="Seedy · Bấm để trò chuyện, kéo để di chuyển">
      <span class="bcn-pet-sprite" aria-hidden="true"></span>
    </button>
    <span id="bcnPetHelp" class="bcn-pet-sr-only">
      Kéo để di chuyển; dùng phím mũi tên khi đang chọn Seedy. Enter để trò chuyện, Home để về góc màn hình.
    </span>
    <button class="bcn-pet-menu-toggle" type="button" aria-label="Tùy chọn thú cưng"
      aria-expanded="false" aria-controls="bcnPetMenu" title="Tùy chọn thú cưng">
      <span aria-hidden="true">···</span>
    </button>
    <div id="bcnPetMenu" class="bcn-pet-menu" role="group" aria-label="Tùy chọn Seedy" hidden>
      <strong>Seedy <span>🌱</span></strong>
      <p>Trợ lý AI local trong BCNPV01</p>
      <button type="button" data-pet-action="chat">Trò chuyện với Seedy</button>
      <button type="button" data-pet-action="wave">Vẫy tay chào</button>
      <button type="button" data-pet-action="reset">Về góc màn hình</button>
      <button type="button" data-pet-action="hide">Ẩn thú cưng</button>
    </div>`;
  const sprite = root.querySelector('.bcn-pet-sprite');
  sprite.style.backgroundImage = `url("${spriteUrl}")`;
  document.body.append(root);

  const menu = root.querySelector('.bcn-pet-menu');
  const menuToggle = root.querySelector('.bcn-pet-menu-toggle');
  const view = {
    root,
    toggle,
    sprite,
    menu,
    menuToggle,
    character: root.querySelector('.bcn-pet-character'),
    positionToggle() {
      const parent = innerWidth <= 600 ? mobileSlot : toolbar;
      if (toggle.parentElement !== parent) parent.prepend(toggle);
    },
    setMenu(open, restoreFocus = false) {
      menu.hidden = !open;
      menuToggle.setAttribute('aria-expanded', String(open));
      if (open) {
        view.positionMenu();
        menu.querySelector('button').focus({ preventScroll: true });
      } else if (restoreFocus) {
        menuToggle.focus({ preventScroll: true });
      }
    },
    positionMenu() {
      if (menu.hidden) return;
      const anchor = root.getBoundingClientRect();
      const bounds = menu.getBoundingClientRect();
      const left = Math.max(12, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - 12));
      const below = anchor.bottom + 8;
      const top = below + bounds.height <= innerHeight - 12 ? below : anchor.top - bounds.height - 8;
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(Math.max(12, top))}px`;
    },
    updateToggle(hidden) {
      const label = hidden ? 'Hiện thú cưng Seedy' : 'Ẩn thú cưng Seedy';
      toggle.setAttribute('aria-label', label);
      toggle.setAttribute('aria-pressed', String(!hidden));
      toggle.title = label;
    }
  };
  return view;
}
