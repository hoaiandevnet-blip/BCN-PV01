export function validateTestMigration({ databaseUrl, nodeEnv }) {
  if (nodeEnv === 'production') throw new Error('Cannot waive backups in production.');
  const target = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('The test-data backup waiver is limited to a local database.');
  }
  const name = decodeURIComponent(target.pathname.slice(1));
  if (!/(?:^|_)(test|demo|qa)(?:_|$)/i.test(name)) {
    throw new Error('The database name must explicitly identify test, demo or QA data.');
  }
  return name;
}
