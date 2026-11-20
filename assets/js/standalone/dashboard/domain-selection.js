export function selectedTrend(data, code = '') {
  const domain = data.domains.find(item => item.code === code);
  if (!domain) return data;
  return { ...data, cases: domain, series: domain.series, selectedDomain: domain };
}
