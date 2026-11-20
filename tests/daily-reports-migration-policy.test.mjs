import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTestMigration } from '../scripts/daily-reports/migration-policy.mjs';

test('explicit test-data waiver accepts only local test or demo targets', () => {
  for (const name of ['ttttch_demo', 'bcn_test_123', 'qa']) {
    assert.equal(validateTestMigration({ databaseUrl: `postgres://localhost/${name}` }), name);
  }
});

test('test-data waiver rejects production, remote hosts and unnamed live databases', () => {
  for (const input of [
    { databaseUrl: 'postgres://localhost/ttttch_demo', nodeEnv: 'production' },
    { databaseUrl: 'postgres://database.example/ttttch_demo' },
    { databaseUrl: 'postgres://localhost/ttttch' },
    { databaseUrl: 'postgres://localhost/production_testlike' }
  ]) assert.throws(() => validateTestMigration(input));
});
