// The command centre receives reports; it is not a sending unit in this tracking view.
// Keep its account permissions and any report records unchanged.
const receivingUnitNames = new Set(['trung tam thong tin chi huy', 'trung tam chi huy']);
const normalizedName = value => String(value ?? '').normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('vi').replaceAll('đ', 'd').trim().replace(/\s+/g, ' ');

export function reportingDashboard(data) {
  if (data.audience === 'unit' || !Array.isArray(data.units)) return data;
  const units = data.units.filter(unit => !receivingUnitNames.has(normalizedName(unit.name)));
  if (units.length === data.units.length) return data;
  const expected = units.filter(unit => unit.expected);
  const submitted = expected.filter(unit => unit.status !== 'missing').length;
  return {
    ...data,
    units,
    progress: {
      ...data.progress,
      expected: expected.length,
      submitted,
      missing: expected.length - submitted,
      complete: expected.filter(unit => unit.status === 'complete').length,
      partial: expected.filter(unit => unit.status === 'partial').length,
      returned: expected.filter(unit => unit.status === 'returned').length,
      percent: expected.length ? Math.round(submitted / expected.length * 100) : null
    }
  };
}
