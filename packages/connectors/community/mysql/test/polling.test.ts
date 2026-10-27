import { expect, it } from 'vitest';
import { mysqlPolling } from '../src/lib/triggers/new-row';

it('uses a composite cursor so rows sharing an update time continue after the last unique key', () => {
  const result = mysqlPolling.queryOf({ input: { table: 'employees', cursorColumn: 'updated_at', keyColumn: 'id' }, cursor: { value: '2026-10-27 12:00:00.123456', key: '9007199254740993' }, latest: false });
  expect(result.sql).toContain('WHERE (`updated_at` > ? OR (`updated_at` = ? AND `id` > ?))');
  expect(result.sql).toContain('ORDER BY `updated_at` ASC, `id` ASC LIMIT 300');
  expect(result.values).toEqual(['2026-10-27 12:00:00.123456', '2026-10-27 12:00:00.123456', '9007199254740993']);
});

it('quotes identifiers and keeps cursor values out of SQL text', () => {
  const value = "value' OR 1=1 --";
  const result = mysqlPolling.queryOf({ input: { table: 'employees`; DROP TABLE employees', cursorColumn: 'id', keyColumn: 'id' }, cursor: { value, key: value }, latest: false });
  expect(result.sql).toContain('`employees``; DROP TABLE employees`');
  expect(result.sql).not.toContain(value);
  expect(result.values).toEqual([value, value, value]);
});
