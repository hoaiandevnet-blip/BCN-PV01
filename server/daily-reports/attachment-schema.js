export async function ensureAttachmentSchema(pool) {
  await pool.query(`create table if not exists daily_report_attachments (
    id uuid primary key,
    case_id uuid references daily_report_cases(id) on delete cascade,
    event_id uuid references daily_report_case_events(id) on delete cascade,
    metric_id uuid references daily_report_metrics(id) on delete cascade,
    situation_id uuid references daily_report_situations(id) on delete cascade,
    file_name text not null,
    media_type text not null,
    byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
    sha256 text not null,
    content bytea not null,
    created_by bigint not null references users(id),
    created_at timestamptz not null default now(),
    sealed_at timestamptz,
    check (num_nonnulls(case_id, event_id, metric_id, situation_id) = 1),
    check (octet_length(content) = byte_size)
  )`);
  for (const column of ['case_id', 'event_id', 'metric_id', 'situation_id']) {
    await pool.query(`create index if not exists daily_report_attachments_${column}_idx
      on daily_report_attachments(${column}) where ${column} is not null`);
  }
}
