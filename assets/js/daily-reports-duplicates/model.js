(() => {
  'use strict';
  const actions = {
    SEPARATE_CASE: ['Vụ độc lập', 'Giữ hồ sơ đang xét là một vụ riêng.'],
    DUPLICATE_NO_RECOUNT: ['Không tính lặp', 'Loại hồ sơ đang xét khỏi số vụ tính mới.'],
    APPEND_EVENT_TO_EXISTING: ['Bổ sung vụ cũ', 'Chuyển nội dung thành diễn biến chờ duyệt của hồ sơ đối chiếu.']
  };
  const normalize = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/đ/g, 'd');
  const pairKey = (first, second) => [String(first), String(second)].sort().join(':');
  const title = item => item.title || item.summary?.replace(/\s+/g, ' ').slice(0, 100) || 'Hồ sơ chưa có tiêu đề';
  function createState() {
    return { rows: [], queue: [], offset: 0, nextOffset: null, total: null, scanned: 0,
      selected: null, busy: false, saving: false, started: false, stopped: false,
      error: '', query: '', level: '', status: 'pending', page: 0, receipts: [], filters: null };
  }
  function visibleRows(state) {
    const query = normalize(state.query);
    return state.rows.filter(row => (!state.level || row.candidate.important)
      && (!state.status || (state.status === 'pending' ? !row.decision && !row.covered : row.decision || row.covered))
      && (!query || normalize([row.source.title, row.source.summary, row.source.unit_name,
        row.source.stable_code, row.candidate.stable_code, row.candidate.summary].join(' ')).includes(query)))
      .sort((first, second) => second.candidate.score - first.candidate.score
        || first.source.stable_code.localeCompare(second.source.stable_code));
  }
  window.DailyReportsDuplicatesModel = { actions, pairKey, title, createState, visibleRows };
})();
