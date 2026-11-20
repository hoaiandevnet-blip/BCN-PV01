import { intakeSchema } from './validation.js';

const domainKeys = new Set([...intakeSchema.entryGroups[1][1], ...intakeSchema.administrativeFields]
  .map(([key]) => key));

export function addDomainTotals(totals, source) {
  if (source.metric_code !== intakeSchema.metricCode || !source.work_domain) return;
  const rows = Array.isArray(source.administrative_domains) ? source.administrative_domains : [];
  const administrativeKeys = new Set(intakeSchema.administrativeFields.map(([key]) => key));
  const values = totals[source.work_domain] ||= Object.create(null);
  for (const [key, value] of Object.entries(source.metric_values || {})) {
    if (!rows.length && domainKeys.has(key)
      && typeof value === 'number' && Number.isFinite(value)) {
      values[key] = (values[key] || 0) + value;
    }
  }
  for (const row of rows) {
    const target = totals[row.domain] ||= Object.create(null);
    for (const [key, value] of Object.entries(row.values || {})) {
      if (administrativeKeys.has(key) && typeof value === 'number' && Number.isFinite(value)) {
        target[key] = (target[key] || 0) + value;
      }
    }
  }
}
