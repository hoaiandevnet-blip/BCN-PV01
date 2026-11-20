const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resources = new Set(['cases', 'reference-cases', 'events', 'work-results', 'situations', 'unlock-requests',
  'leaders', 'drafts', 'exports']);
export function validateDailyReportRequest(req, res, next) {
  const reject = message => res.status(422).json({ code: 'INVALID_IDENTIFIER', error: message });
  const segments = req.path.split('/').filter(Boolean);
  const routeId = resources.has(segments[0]) ? segments[1]
    : (segments[0] === 'legal' && segments[1] === 'versions')
      || (segments[0] === 'configuration' && segments[1] === 'metrics') ? segments[2] : null;
  if (routeId && !uuid.test(routeId)) return reject('Mã định danh đối tượng không hợp lệ.');
  if (segments[2] === 'attachments' && segments[3] && !uuid.test(segments[3])) {
    return reject('Mã văn bản đính kèm không hợp lệ.');
  }
  for (const key of ['id', 'case_id', 'candidate_case_id', 'leader_id', 'legal_article_id', 'supersedes_id']) {
    if (req.body?.[key] && !uuid.test(req.body[key])) return reject('Mã tham chiếu không hợp lệ.');
  }
  if (Array.isArray(req.body?.items) && req.body.items.some(item => !uuid.test(item.source_id))) {
    return reject('Mã nguồn tổng hợp không hợp lệ.');
  }
  for (const key of ['case_id', 'version_id']) {
    if (req.query[key] && !uuid.test(req.query[key])) return reject('Mã truy vấn không hợp lệ.');
  }
  if (req.body?.occurred_at && !Number.isFinite(new Date(req.body.occurred_at).getTime())) {
    return reject('Thời điểm xảy ra không hợp lệ.');
  }
  next();
}
