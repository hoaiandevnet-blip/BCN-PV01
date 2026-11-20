export const COMPILER_MODULES = {
  input: 'Nhập báo cáo ngày',
  registry: 'Tra cứu vụ việc',
  approval: 'Phê duyệt vụ việc',
  legal: 'Danh mục pháp luật',
  returned: 'Báo cáo bị trả lại',
  updates: 'Cập nhật / Bổ sung',
  unlock: 'Lịch sử đề nghị',
  duplicates: 'Kiểm tra trùng',
  composer: 'Tổng hợp báo cáo',
  history: 'Lịch sử xử lý'
};

export const ROLE_MODULES = {
  UNIT_REPORTER: ['input', 'registry', 'legal', 'returned', 'updates', 'unlock'],
  PV01_COMPILER: Object.keys(COMPILER_MODULES),
  LEGAL_REVIEWER: ['legal'],
  AUDITOR: ['legal', 'history']
};

export function availableModules(user) {
  if (user.is_admin) return Object.keys(COMPILER_MODULES);
  return Object.keys(COMPILER_MODULES).filter(key => user.roles.some(role =>
    (key !== 'approval' || user.approvalAllowed !== false)
    && ROLE_MODULES[role.role_code]?.includes(key)
    && (role.submodules == null || role.submodules.includes(key))));
}

export function compilerHasModule(role, key) {
  return role.role_code === 'PV01_COMPILER'
    && (role.submodules == null || role.submodules.includes(key));
}

export function compilerModules(user) {
  if (user.is_admin) return Object.keys(COMPILER_MODULES);
  return Object.keys(COMPILER_MODULES).filter(key => (key !== 'approval' || user.approvalAllowed !== false)
    && user.roles.some(role => compilerHasModule(role, key)));
}

export function validateSubmodules(value, fail, roleCode = 'PV01_COMPILER') {
  if (!Array.isArray(value) || value.some(key => !ROLE_MODULES[roleCode]?.includes(key))) {
    fail(422, 'INVALID_SUBMODULES', 'Danh sách mục con Báo cáo ngày không hợp lệ.');
  }
  return [...new Set(value)];
}

// Shared reads are available to each screen that actually needs them. Mutations use a narrower gate.
export function routeModules(path, method, query = {}) {
  if (/^\/(scope|units|notifications)(\/|$)/.test(path)) return null;
  if (/^\/(user-roles|role-assignments|configuration)/.test(path)) return null;
  if (path === '/overview') return ['overview'];
  if (path === '/dashboard') return ['registry', 'approval', 'input', 'composer'];
  const reading = method === 'GET';
  const caseReaders = ['input', 'registry', 'approval', 'returned', 'updates', 'duplicates'];
  const caseEditors = ['input', 'returned', 'updates'];
  if (/^\/(cases|work-results|events)(\/|$)/.test(path)
    && /\/(verify|return|request-supplement)$/.test(path)) return ['approval'];
  if (reading && ['registry', 'approval'].includes(query.workspace)
    && /^\/(cases|work-results|situations|events)(\/|$)/.test(path)) return [query.workspace];
  if (/^\/reference-case/.test(path)) return reading ? caseReaders : caseEditors;
  if (path === '/unlock-requests' && method === 'POST') return ['input'];
  if (/^\/unlock-requests/.test(path)) return ['unlock'];
  if (/^\/duplicates/.test(path)) return ['duplicates'];
  if (/^\/audit/.test(path)) return ['history'];
  if (/^\/(drafts|exports|composer|leaders|statistics)/.test(path)) return ['composer'];
  if (/^\/legal\/(entry-options|articles)/.test(path) && reading) {
    return ['legal', ...caseReaders];
  }
  if (/^\/legal/.test(path)) return ['legal'];
  if (/^\/situations(\/|$)/.test(path)) return ['input'];
  if (/^\/work-results(\/|$)/.test(path)) {
    return reading ? caseReaders : ['input', 'returned'];
  }
  if (/^\/(daily-intake|metric-definitions)/.test(path)) return ['input'];
  if (/^\/events\//.test(path) || /\/events(?:\/|$)/.test(path)) {
    return reading ? caseReaders : ['updates'];
  }
  if (/\/counting$/.test(path)) return ['composer'];
  if (path === '/cases' && reading) {
    if (query.has_returns === 'true') return ['returned'];
    if (query.followup === 'true') return ['updates'];
    return caseReaders;
  }
  if (/^\/cases/.test(path)) return reading ? caseReaders : caseEditors;
  return null;
}

export function restrictCompilerRequest(req, fail) {
  const user = req.dailyActor;
  if (user.is_admin) return;
  const required = routeModules(req.path, req.method, req.query);
  if (!required || required.includes('overview')) return;
  const roles = user.roles.filter(role => required.some(key =>
    (key !== 'approval' || user.approvalAllowed !== false)
    && ROLE_MODULES[role.role_code]?.includes(key)
    && (role.submodules == null || role.submodules.includes(key))));
  if (!roles.length) fail(403, 'SUBMODULE_FORBIDDEN', 'Chưa được phân quyền mục con Báo cáo ngày này.');
  req.dailyActor = { ...user, roles };
}
