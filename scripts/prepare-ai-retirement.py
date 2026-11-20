from pathlib import Path
import hashlib
import json
import re

project = Path(__file__).resolve().parents[2]
private = project / 'BCNPV01/.private'
manifest = json.loads((private / 'retirement-manifest.json').read_text())
def stage(relative, transform):
    source = project / relative
    original = source.read_text()
    result = transform(original)
    for destination, content in [(private / 'retirement' / relative, result),
                                 (private / 'old-source' / relative, original)]:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content)
    manifest[relative] = {'before': hashlib.sha256(original.encode()).hexdigest(),
                          'after': hashlib.sha256(result.encode()).hexdigest()}

def knowledge(text):
    text = text.replace("import { readdir, readFile } from 'node:fs/promises';\n", '')
    text = text.replace('kiểm kê, bản đồ camera, bản đồ số và tài liệu giao ban NQ57.', 'kiểm kê và bản đồ camera.')
    text = re.sub(r"  \['map',.*?(?=  \['camera')", '', text, flags=re.S)
    text = re.sub(r"  \['meetings',.*?(?=  \['access')", '', text, flags=re.S)
    start = text.index("  if (documentIntent && access.allowed.has('nq57Meeting')) {")
    end = text.index('  const expanded = ', start)
    text = text[:start] + text[end:]
    return text

def routing(text):
    text = re.sub(r"  \[/ban do so\|vu viec.*?\n", '', text)
    start = text.index('  if (overview || document) {')
    end = text.index('  const assetOverview', start)
    text = text[:start] + '''  if (document) {
    return { queries: [], knowledgeQuery: '',
      clarification: 'Phân hệ Họp thông minh đã được gỡ khỏi hệ thống.',
      metrics: { strategy: 'retired-module' } };
  }
  if (/ban do so|bao cao ngay/.test(text)) {
    return { queries: [], knowledgeQuery: '',
      clarification: 'Báo cáo ngày và Bản đồ số đã chuyển sang phần mềm BCNPV01.',
      metrics: { strategy: 'retired-module' } };
  }
  if (overview) {
    return { queries: [], knowledgeQuery: question, clarification: '',
      metrics: { strategy: 'knowledge-retrieval' } };
  }
''' + text[end:]
    return text

def assistant_tests(text):
    start = text.index("test('documents are absent")
    end = text.index("test('app overview", start)
    text = text[:start] + '''test('retired meeting documents stay absent even with a stale permission', async () => {
  for (const scope of [self, { ...access, allowed: new Set([...access.allowed, 'nq57Meeting']) }]) {
    const result = await retrieveKnowledge('Giao ban NQ57 ket luan', scope);
    assert.ok(result.records.every(record => record.kind !== 'document'));
    assert.equal(result.warnings.length, 0);
  }
});

''' + text[end:]
    start = text.index("test('natural time/location")
    end = text.index("test('local inference", start)
    text = text[:start] + '''test('overview no longer advertises removed business modules', async () => {
  const result = await retrieveKnowledge('Phần mềm này dùng để làm gì?', access);
  const overview = result.records.find(record => record.id === 'H-overview');
  assert.ok(overview);
  assert.doesNotMatch(overview.text, /bản đồ số|NQ57/);
});

''' + text[end:]
    return text

def routing_tests(text):
    start = text.index("test('document routing")
    end = text.index("test('category omission", start)
    text = text[:start] + '''test('retired modules return relocation information without querying their data', () => {
  const meeting = directRetrievalPlan('Giao ban NQ57 ở đâu?', access, []);
  assert.deepEqual(meeting.queries, []);
  assert.match(meeting.clarification, /đã được gỡ/);
  const map = directRetrievalPlan('Bản đồ số ở đâu?', access, []);
  assert.deepEqual(map.queries, []);
  assert.match(map.clarification, /BCNPV01/);
});

''' + text[end:]
    start = text.index("test('map sums")
    text = text[:start] + '''test('removed map tables cannot be queried even by a stale administrator session', () => {
  assert.throws(() => compileQuery({ source: 'map_cases', operation: 'count' }, access));
  assert.throws(() => compileQuery({ source: 'map_periods', operation: 'count' }, access));
});
'''
    return text

stage('server/ai-assistant/knowledge.js', knowledge)
stage('server/ai-assistant/routing.js', routing)
stage('tests/ai-assistant/assistant.test.mjs', assistant_tests)
stage('tests/ai-assistant/routing.test.mjs', routing_tests)
(private / 'retirement-manifest.json').write_text(json.dumps(manifest, indent=2))
print('AI dependencies and regression tests prepared.')
