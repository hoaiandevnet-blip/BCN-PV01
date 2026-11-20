const wordPattern = /[\p{L}\p{M}\p{N}]+/gu;
const numberPattern = new RegExp(
  '(?<![\\p{L}\\p{M}\\p{N}_])[+-]?\\d+(?:[.,:/-]\\d+)*(?:[ \\u00a0]*%)?'
    + '(?![\\p{L}\\p{M}\\p{N}_]|[.,:/-]\\d)', 'gu'
);
const key = text => text.normalize('NFC').toLocaleLowerCase('vi');
let administrativeNames = new Map();
let catalogPromise;

function nameIndex(names) {
  const root = new Map();
  for (const name of names) {
    if (typeof name !== 'string' || !name.trim()) continue;
    let node = root;
    for (const match of name.matchAll(wordPattern)) {
      const token = key(match[0]);
      if (!node.has(token)) node.set(token, new Map());
      node = node.get(token);
    }
    if (node !== root) node.set(null, true);
  }
  return root;
}

export function loadAdministrativeNames() {
  catalogPromise ||= fetch('/assets/data/vietnam-provinces-wards.json', {
    signal: AbortSignal.timeout(5000)
  }).then(async response => {
    if (!response.ok) throw new Error('Không tải được danh mục địa danh.');
    const provinces = await response.json();
    const names = [];
    for (const province of provinces) {
      names.push(province.name, province.name.replace(/^(Tỉnh|Thành phố)\s+/iu, ''));
      if (/^Thành phố /iu.test(province.name)) names.push(province.name.replace(/^Thành phố /iu, 'TP. '));
      for (const ward of province.wards || []) names.push(ward.name);
    }
    administrativeNames = nameIndex(names);
    return true;
  }).catch(() => false);
  return catalogPromise;
}

function placeRanges(content, names) {
  const words = [...content.matchAll(wordPattern)].map(match => ({
    key: key(match[0]), start: match.index, end: match.index + match[0].length
  }));
  const indexes = [administrativeNames, nameIndex(names)];
  const ranges = [];
  for (let start = 0; start < words.length; start += 1) {
    let last = -1;
    for (const root of indexes) {
      let node = root;
      for (let end = start; end < words.length; end += 1) {
        if (end > start && !/^[ \t\u00a0.'’\-]+$/.test(content.slice(words[end - 1].end, words[end].start))) break;
        node = node.get(words[end].key);
        if (!node) break;
        if (node.has(null)) last = Math.max(last, end);
      }
    }
    if (last < start) continue;
    ranges.push({ start: words[start].start, end: words[last].end, kind: 'place' });
    start = last;
  }
  return ranges;
}

export function highlightRanges(content, names = []) {
  const places = placeRanges(content, names);
  const ranges = [...places];
  for (const match of content.matchAll(numberPattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (places.some(place => start < place.end && end > place.start)) continue;
    ranges.push({ start, end, kind: 'number' });
  }
  return ranges.sort((first, second) => first.start - second.start);
}
