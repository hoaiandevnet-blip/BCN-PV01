// Remove generated presentation prefixes, never identifiers or references inside the narrative.
const generatedCode = /^\s*BCN-\d{8}-[a-f\d]{8}(?:\s*[·|:–—]\s*|\s+|$)/iu;
const testMarker = /^\s*\[(?:DỮ\s+LIỆU\s+TEST(?:\s+BCN-[\w-]+)?|TEST(?:\s+BCN-[\w-]+)?)\]\s*/iu;
const reportFields = new Set(['title', 'case_title', 'summary', 'narrative', 'source_text', 'edited_text']);

export function cleanReportText(value) {
  return String(value ?? '').split('\n').map(line => {
    let result = line;
    let previous;
    do {
      previous = result;
      result = result.replace(generatedCode, '').replace(testMarker, '');
    } while (result !== previous);
    return result;
  }).join('\n');
}

export function reportDisplayPayload(value) {
  if (Array.isArray(value)) return value.map(reportDisplayPayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    reportFields.has(key) && typeof item === 'string' ? cleanReportText(item) : reportDisplayPayload(item)
  ]));
}
