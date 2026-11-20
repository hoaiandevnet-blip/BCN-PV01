// Source colours: the original system's style.css and appearance picker.
export const palettes = [
  { id: 'charcoal', name: 'Glass hiện tại', description: 'Than chì và vàng champagne',
    accent: '#d6b882', lightAccent: '#806023', nav: '#1b1d21', paper: '#f5f4f0' },
  { id: 'crimson', name: 'Đỏ CAND', description: 'Đỏ truyền thống của hệ thống cũ',
    accent: '#b91c1c', lightAccent: '#b91c1c', nav: '#450a0a', paper: '#fff7ed' },
  { id: 'gold', name: 'Vàng đồng', description: 'Ấm áp, trang trọng',
    accent: '#b7791f', lightAccent: '#8a4b0f', nav: '#3b2a06', paper: '#fff8eb' },
  { id: 'emerald', name: 'Xanh nghiệp vụ', description: 'Xanh ngọc dịu mắt',
    accent: '#0f766e', lightAccent: '#0f766e', nav: '#052e2b', paper: '#f0f8f5' },
  { id: 'midAutumn', name: 'Trung thu', description: 'Đỏ rượu và vàng trăng',
    accent: '#a41135', lightAccent: '#a41135', nav: '#3c1b38', paper: '#fff4e4' },
  { id: 'womenDay', name: 'Hồng 20/10', description: 'Hồng phấn và đỏ hoa hồng',
    accent: '#b51f50', lightAccent: '#b51f50', nav: '#39223d', paper: '#fff4f7' }
];

export const appearanceDefaults = Object.freeze({ palette: 'charcoal', mode: 'dark' });
export const validAppearance = value => Boolean(value &&
  palettes.some(palette => palette.id === value.palette) && ['light', 'dark'].includes(value.mode));

function mix(from, to, ratio) {
  const channels = [1, 3, 5].map(offset => {
    const first = parseInt(from.slice(offset, offset + 2), 16);
    const second = parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(first + (second - first) * ratio).toString(16).padStart(2, '0');
  });
  return '#' + channels.join('');
}

export function appearanceTokens(appearance) {
  const palette = palettes.find(item => item.id === appearance.palette) || palettes[0];
  const dark = appearance.mode !== 'light';
  const original = palette.id === 'charcoal' && dark;
  const background = dark ? mix('#17181c', palette.nav, .3) : palette.paper;
  const surface = dark ? mix('#22252a', palette.nav, .22) : '#ffffff';
  const side = dark ? mix('#1b1d21', palette.nav, .35) : mix(palette.paper, '#ffffff', .4);
  const raised = dark ? mix('#2a2d33', palette.nav, .18) : mix(palette.paper, '#ffffff', .3);
  const accent = dark ? (original ? palette.accent : mix(palette.accent, '#ffffff', .58)) : palette.lightAccent;
  const edge = dark ? '#ffffff29' : '#29354a26';
  const muted = dark ? '#aaaeb6' : '#596374';
  const button = original ? '#d6b882' : palette.lightAccent;
  const onButton = original ? '#21190d' : '#ffffff';
  return {
    '--ui-bg': original ? '#17181c' : background,
    '--ui-side': original ? '#1b1d21' : side,
    '--ui-surface': surface,
    '--ui-raised': raised,
    '--ui-hover': dark ? '#434950' : '#e0e5e9',
    '--ui-field': dark ? mix(background, '#000000', .08) : '#ffffff',
    '--ui-text': dark ? '#ecebe6' : '#172136',
    '--ui-secondary': dark ? '#c4c7cd' : '#424e61',
    '--ui-muted': muted,
    '--ui-line': dark ? '#ffffff1f' : '#29354a1f',
    '--ui-line-strong': edge,
    '--ui-gold': accent,
    '--ui-gold-hover': dark ? mix(accent, '#ffffff', .18) : mix(accent, '#000000', .18),
    '--ui-gold-soft': accent + '18',
    '--ui-gold-line': accent + '50',
    '--ui-on-gold': onButton,
    '--ui-ok': dark ? '#6fcf9f' : '#087443',
    '--ui-ok-soft': dark ? '#6fcf9f1f' : '#08744314',
    '--ui-warn': dark ? '#e3a95c' : '#8a4b0f',
    '--ui-warn-soft': dark ? '#e3a95c1f' : '#8a4b0f14',
    '--ui-error': dark ? '#ec6f76' : '#b42332',
    '--ui-error-soft': dark ? '#ec6f761f' : '#b4233214',
    '--ui-info': dark ? '#94afd6' : '#0369a1',
    '--ui-info-soft': dark ? '#94afd61f' : '#0369a114',
    '--ui-scheme': dark ? 'dark' : 'light',
    '--glass-panel': `linear-gradient(135deg, #ffffff25, #ffffff05 55%), ${surface}${dark ? 'cc' : 'bd'}`,
    '--glass-panel-solid': surface,
    '--glass-dialog': `linear-gradient(135deg, #ffffff20, #ffffff05 55%), ${surface}f5`,
    '--glass-inset': (dark ? background : '#ffffff') + 'b8',
    '--glass-edge': edge,
    '--glass-edge-lit': dark ? '#ffffff47' : '#ffffffed',
    '--glass-side': `linear-gradient(115deg, #ffffff10, transparent 65%), ${side}ed`,
    '--glass-topbar': `linear-gradient(100deg, #ffffff18, transparent 70%), ${side}df`,
    '--glass-featured': `linear-gradient(135deg, ${accent}22, #ffffff08 60%), ${surface}cf`,
    '--glass-accent': `linear-gradient(140deg, ${accent}24, ${accent}08)`,
    '--glass-primary': `linear-gradient(165deg, ${mix(button, '#ffffff', original ? .25 : .06)}, ${button})`,
    '--glass-primary-hover': `linear-gradient(165deg, ${button}, ${mix(button, '#000000', .16)})`,
    '--glass-primary-text': onButton,
    '--glass-control': raised + 'b8',
    '--glass-control-hover': dark ? '#434950b8' : '#ffffffd9',
    '--glass-row': surface + 'd9',
    '--glass-row-alt': raised + 'c4',
    '--glass-table-head': side + 'f0',
    '--glass-shadow': `inset 0 1px 0 #ffffff45, 0 12px 32px ${dark ? '#00000038' : '#26334d12'}`,
    '--ui-shadow': `inset 0 1px 0 #ffffff30, 0 5px 18px ${dark ? '#00000026' : '#26334d0f'}`,
    '--ui-pop-shadow': `inset 0 1px 0 #ffffff50, 0 26px 70px ${dark ? '#00000099' : '#26334d26'}`
  };
}
