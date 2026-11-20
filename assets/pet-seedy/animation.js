// The original Seedy v2 atlas is 1536 × 2288: eight 192 × 208 cells across, eleven rows.
export const atlas = Object.freeze({ width: 1536, height: 2288, columns: 8, rows: 11 });
export const spriteUrl = new URL('./seedy.webp', import.meta.url).href;

function sequence(row, count, duration, lastDuration) {
  return Array.from({ length: count }, (_, column) => ({
    row,
    column,
    duration: column === count - 1 ? lastDuration : duration
  }));
}

const animations = {
  idle: [280, 110, 110, 140, 140, 320].map((duration, column) => ({ row: 0, column, duration: duration * 6 })),
  right: sequence(1, 8, 120, 220),
  left: sequence(2, 8, 120, 220),
  wave: sequence(3, 4, 140, 280),
  jump: sequence(4, 5, 140, 280),
  working: sequence(7, 6, 120, 220),
  review: sequence(8, 6, 150, 280)
};

export async function loadArtwork() {
  const image = new Image();
  image.src = spriteUrl;
  await image.decode();
  if (image.naturalWidth !== atlas.width || image.naturalHeight !== atlas.height) {
    throw new Error('Bộ ảnh Seedy không đúng kích thước 1536 × 2288.');
  }
}

export function createAnimator(element, reducedMotion) {
  let timer;
  let current = '';
  let enabled = false;

  function stop() {
    clearTimeout(timer);
    timer = undefined;
    current = '';
  }

  function draw(frame) {
    const horizontal = frame.column / (atlas.columns - 1) * 100;
    const vertical = frame.row / (atlas.rows - 1) * 100;
    element.style.backgroundPosition = `${horizontal}% ${vertical}%`;
    element.dataset.frame = `${frame.row}:${frame.column}`;
  }

  function play(name = 'idle', once = false) {
    if (!enabled || (current === name && !once)) return;
    stop();
    current = name;
    element.dataset.animation = name;
    const frames = animations[name] || animations.idle;
    let index = 0;
    draw(frames[index]);
    if (reducedMotion.matches) return;
    const advance = () => {
      timer = setTimeout(() => {
        index += 1;
        if (index === frames.length) {
          if (once) {
            play('idle');
            return;
          }
          index = 0;
        }
        draw(frames[index]);
        advance();
      }, frames[index].duration);
    };
    advance();
  }

  return {
    play,
    setEnabled(value) {
      enabled = value;
      stop();
      if (enabled) play('idle');
    },
    look(point, bounds) {
      if (!enabled || reducedMotion.matches || !['idle', 'look'].includes(current)) return;
      const horizontal = point.x - (bounds.left + bounds.width / 2);
      const vertical = point.y - (bounds.top + bounds.height / 2);
      if (Math.hypot(horizontal, vertical) < 1) return;
      // Sixteen equally spaced directions, starting upwards and rotating clockwise.
      const angle = (Math.atan2(horizontal, -vertical) + Math.PI * 2) % (Math.PI * 2);
      const direction = Math.round(angle / (Math.PI * 2 / 16)) % 16;
      stop();
      current = 'look';
      element.dataset.animation = current;
      draw({ row: 9 + Math.floor(direction / 8), column: direction % 8 });
      timer = setTimeout(() => play('idle'), 850);
    }
  };
}
