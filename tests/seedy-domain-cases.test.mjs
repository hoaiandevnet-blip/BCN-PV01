import assert from 'node:assert/strict';
import test from 'node:test';
import { planDataQuestion } from '../server/seedy-ai/questions/intent.js';
import { directTool } from '../server/seedy-ai/daily/planner.js';
import { resolveDomain, resolveState, executeDomainCasesTool } from '../server/seedy-ai/daily/domain-cases.js';

const today = '2026-11-19';

test('planDataQuestion does not intercept domain case or returned inquiries as simple unit progress', () => {
  const queries = [
    'hôm nay trong 7 đơn vị báo cáo lên có những đơn vị nào có vụ việc liên quan đến hệ vụ việc phạm pháp hình sự',
    'trong ngày hôm nay đối với tất cả các đơn vị có đơn vị nào bị trả lại vụ việc ko',
    'những đơn vị nào có vụ việc phạm pháp hình sự hôm nay',
    'có đơn vị nào báo cáo về ma túy hôm nay không',
    'thống kê các vụ việc công nghệ cao hôm nay',
    'đơn vị nào có vụ việc về kinh tế'
  ];
  for (const q of queries) {
    assert.equal(planDataQuestion(q, [], today), null, `Should return null for: ${q}`);
  }
});

test('resolveDomain and resolveState identify business codes and states correctly', () => {
  assert.equal(resolveDomain('hệ vụ việc phạm pháp hình sự')?.code, 'PPHS');
  assert.equal(resolveDomain('có vụ ma túy nào không')?.code, 'MA_TUY');
  assert.equal(resolveDomain('lừa đảo công nghệ cao')?.code, 'CONG_NGHE_CAO');
  assert.equal(resolveDomain('buôn lậu và kinh tế chức vụ')?.code, 'KINH_TE');
  assert.equal(resolveDomain('xả thải gây ô nhiễm môi trường')?.code, 'MOI_TRUONG');
  assert.equal(resolveDomain('tụ điểm đánh bạc ghi số đề tệ nạn xã hội')?.code, 'TNXH');
  assert.equal(resolveDomain('tiến độ nộp báo cáo hôm nay'), null);

  assert.equal(resolveState('có đơn vị nào bị trả lại vụ việc ko')?.state, 'RETURNED');
  assert.equal(resolveState('vụ việc cần bổ sung')?.state, 'RETURNED');
  assert.equal(resolveState('có vụ nào chờ duyệt không')?.state, 'PENDING_REVIEW');
  assert.equal(resolveState('đã duyệt những vụ nào')?.state, 'VERIFIED');
});

test('directTool classifies domain case and state inquiries as domain_cases tool', () => {
  const queries = [
    'hôm nay trong 7 đơn vị báo cáo lên có những đơn vị nào có vụ việc liên quan đến hệ vụ việc phạm pháp hình sự',
    'trong ngày hôm nay đối với tất cả các đơn vị có đơn vị nào bị trả lại vụ việc ko',
    'những đơn vị nào có vụ ma túy',
    'hôm nay có vụ việc nào về công nghệ cao không',
    'những đơn vị nào có vụ việc hôm nay'
  ];
  for (const q of queries) {
    assert.equal(directTool(q, null), 'domain_cases', `Should be domain_cases for: ${q}`);
  }
  assert.equal(directTool('Còn ma túy?', { kind: 'domain_cases' }), 'domain_cases');
});

test('executeDomainCasesTool groups cases by unit and outputs clean Vietnamese narrative', async () => {
  const mockCases = [
    { id: '1', title: 'Trộm cắp xe máy', unit_name: 'Xã An Phước', current_state: 'PENDING_REVIEW' },
    { id: '2', title: 'Cướp giật túi xách', unit_name: 'Xã An Phước', current_state: 'PENDING_REVIEW' },
    { id: '3', title: 'Cố ý gây thương tích', unit_name: 'Xã An Viễn', current_state: 'VERIFIED' }
  ];

  let readParams = null;
  const mockRead = async (resource, params) => {
    if (resource === 'cases') {
      readParams = params;
      return { cases: mockCases, total: 3 };
    }
    if (resource === 'dashboard') {
      return { units: [{ name: 'Xã An Phước', expected: true }, { name: 'Xã An Viễn', expected: true }] };
    }
    return { cases: [], total: 0 };
  };

  const result = await executeDomainCasesTool({
    query: 'hôm nay trong 7 đơn vị báo cáo lên có những đơn vị nào có vụ việc liên quan đến hệ vụ việc phạm pháp hình sự',
    period: { from: '2026-11-19', to: '2026-11-19' },
    memory: null,
    read: mockRead,
    sources: title => [{ id: 'dailyReports', title }]
  });

  assert.equal(readParams.business_code, 'PPHS');
  assert.equal(readParams.from_day, '2026-11-19');
  assert.equal(readParams.to_day, '2026-11-19');
  assert.equal(result.action.type, 'cases');
  assert.equal(result.action.domain, 'PPHS');
  assert.equal(result.action.from, '2026-11-19');
  assert.equal(result.action.to, '2026-11-19');
  assert.match(result.text, /Ngày 19\/11\/2026, trong phạm vi tài khoản của bạn/);
  assert.match(result.text, /có 2 đơn vị báo cáo ghi nhận 3 vụ việc/);
  assert.match(result.text, /• Xã An Phước \(2 vụ\):/);
  assert.match(result.text, /• Xã An Viễn \(1 vụ\):/);
  assert.match(result.text, /Trộm cắp xe máy \(chờ duyệt\)/);
  assert.match(result.text, /Cố ý gây thương tích \(đã duyệt\)/);
});

test('executeDomainCasesTool correctly reports returned cases by unit and reason', async () => {
  const mockCases = [
    { id: 'ret-1', title: 'Gây ô nhiễm môi trường (Xã Bàu Hàm)', unit_name: 'Xã Bàu Hàm', current_state: 'RETURNED' }
  ];

  const mockRead = async resource => {
    if (resource === 'cases') {
      return { cases: mockCases, total: 1 };
    }
    if (resource === 'cases/ret-1') {
      return {
        case: mockCases[0],
        returns: [{ reason: 'BÁO CÁO THỬ. Bổ sung kết quả đo nồng độ nước thải.' }]
      };
    }
    if (resource === 'dashboard') {
      return {
        units: [
          { name: 'Xã Bàu Hàm', expected: true },
          { name: 'Xã An Phước', expected: true },
          { name: 'Xã Bình An', expected: true }
        ]
      };
    }
    return { cases: [], total: 0 };
  };

  const result = await executeDomainCasesTool({
    query: 'trong ngày hôm nay đối với tất cả các đơn vị có đơn vị nào bị trả lại vụ việc ko',
    period: { from: '2026-11-19', to: '2026-11-19' },
    memory: null,
    read: mockRead,
    sources: title => [{ id: 'dailyReports', title }]
  });

  assert.equal(result.action.type, 'cases');
  assert.equal(result.action.state, 'RETURNED');
  assert.equal(result.action.byReturn, true);
  assert.match(result.text, /có 1 đơn vị có vụ việc bị trả lại \(cần bổ sung\):/);
  assert.match(result.text, /• Xã Bàu Hàm \(1 vụ\):/);
  assert.match(result.text, /Gây ô nhiễm môi trường \(Xã Bàu Hàm\) — bị trả lại/);
  assert.match(result.text, /Lý do trả lại: Bổ sung kết quả đo nồng độ nước thải\./);
  assert.match(result.text, /Các đơn vị còn lại \(2 đơn vị: Xã An Phước, Xã Bình An\) không có vụ việc bị trả lại\./);
});

test('executeDomainCasesTool handles zero cases gracefully', async () => {
  const mockRead = async resource => {
    if (resource === 'dashboard') {
      return { units: [{ name: 'Xã An Phước', expected: true }] };
    }
    return { cases: [], total: 0 };
  };
  const result = await executeDomainCasesTool({
    query: 'có vụ việc an ninh quốc gia nào không',
    period: { from: '2026-11-19', to: '2026-11-19' },
    memory: null,
    read: mockRead,
    sources: title => [{ id: 'dailyReports', title }]
  });

  assert.match(result.text, /không có đơn vị nào ghi nhận vụ việc thuộc hệ An ninh quốc gia/);
});
