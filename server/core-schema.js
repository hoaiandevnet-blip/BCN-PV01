export async function ensureCoreSchema(pool) {
  await pool.query(`
    create table if not exists departments (
      id bigserial primary key, name text not null unique, created_at timestamptz not null default now(),
      unit_type text not null default 'Cấp phòng', parent_id bigint references departments(id),
      updated_at timestamptz not null default now()
    );
    create table if not exists teams (
      id bigserial primary key, department_id bigint references departments(id), name text not null,
      created_at timestamptz not null default now(), parent_team_id bigint references teams(id)
    );
    create table if not exists ranks (
      id bigserial primary key, name text not null unique,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table if not exists positions (
      id bigserial primary key, name text not null unique,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table if not exists users (
      id bigserial primary key, username text not null unique, password_hash text not null, full_name text not null,
      phone text, rank_id bigint references ranks(id), position_id bigint references positions(id),
      team_id bigint references teams(id), role_name text not null default 'Cán bộ nghiệp vụ',
      status text not null default 'Hoạt động', is_admin boolean not null default false,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      is_deleted boolean not null default false, failed_login_count integer not null default 0,
      locked_until timestamptz, session_unlimited boolean not null default false, notification_modules text[]
    );
    create table if not exists modules (
      id bigserial primary key, module_key text not null unique, name text not null, description text, icon text,
      visible boolean not null default true, is_admin_only boolean not null default false,
      is_custom boolean not null default false, created_at timestamptz not null default now(), parent_module_key text
    );
    create table if not exists permissions (
      id bigserial primary key, module_id bigint references modules(id), name text not null unique,
      created_at timestamptz not null default now()
    );
    create table if not exists user_permissions (
      user_id bigint references users(id) on delete cascade,
      permission_id bigint references permissions(id) on delete cascade,
      created_at timestamptz not null default now(), primary key(user_id, permission_id)
    );
    create table if not exists activity_logs (
      id bigserial primary key, actor_username text not null, action text not null,
      module_key text, module_name text, detail text, metadata jsonb not null default '{}',
      created_at timestamptz not null default now()
    );
    create table if not exists digital_map_periods (
      id bigserial primary key, period_key text not null unique, label text not null,
      period_from date not null, period_to date not null, is_demo boolean not null default false,
      source_file text not null default '', created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists digital_map_cases (
      id bigserial primary key, report_date date not null, period_key text, period_from date, period_to date,
      metric_type text not null default 'case', ward_code text not null, ward_name text not null,
      category text not null, category_key text not null, severity text not null, severity_key text not null,
      case_count integer not null check(case_count >= 0), subject_count integer check(subject_count >= 0),
      vehicle_count integer check(vehicle_count >= 0), note text not null default '', source_file text not null,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(report_date, ward_code, category_key, severity_key)
    );
    create index if not exists digital_map_date_idx on digital_map_cases(report_date desc);
    create index if not exists digital_map_period_idx on digital_map_cases(period_key, report_date desc);
  `);
}

export async function ensureApplicationModules(pool) {
  for (const [key, name, icon, admin] of [
    ['digitalMap', 'Bản đồ số', 'map-pinned', true],
    ['permissions', 'Tài khoản & phân quyền', 'shield-check', true],
    ['teamManager', 'Danh mục đơn vị', 'building-2', true]
  ]) {
    await pool.query(`insert into modules(module_key,name,icon,is_admin_only)
      values($1,$2,$3,$4) on conflict(module_key) do nothing`, [key, name, icon, admin]);
    await pool.query(`insert into permissions(module_id,name)
      select id,name from modules where module_key=$1 on conflict(name) do nothing`, [key]);
  }
}
