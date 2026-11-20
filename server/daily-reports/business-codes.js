const aliases = {
  KHAC: 'PPHS', PCCC_CNCH: 'PPHS', TNGT: 'PPHS', TTXH: 'PPHS', THAM_NHUNG: 'KINH_TE'
};

export function canonicalBusinessCode(code) {
  return Object.hasOwn(aliases, code) ? aliases[code] : code;
}

export function businessCodeGroup(code) {
  const canonical = canonicalBusinessCode(code);
  return [canonical, ...Object.keys(aliases).filter(alias => aliases[alias] === canonical)];
}

export function matchesBusinessCode(codes, selected) {
  const canonical = canonicalBusinessCode(selected);
  return codes.some(code => canonicalBusinessCode(code) === canonical);
}
