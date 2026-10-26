import { createTrigger, Property, TriggerStrategy } from '@fema-ipaas/connector-sdk';
import { isObject } from '@fema-ipaas/connector-sdk';
import { createConnection } from 'promise-mysql';
import sqlstring from 'sqlstring';
import { mysqlAuth } from '../auth';

export const newRow = createTrigger({
  name: 'new-row', displayName: 'New or updated row', description: 'Poll a monotonically increasing ID or update time, with a unique key to retain rows sharing the same timestamp',
  auth: mysqlAuth, classification: 'READ', type: TriggerStrategy.POLLING,
  reliability: { rateLimits: [{ bucket: 'mysql-query', scope: 'APP', perSecond: 50 }] },
  props: {
    table: Property.ShortText({ displayName: 'Table', required: true }),
    cursorColumn: Property.ShortText({ displayName: 'Increasing ID or update timestamp column', description: 'Must increase as rows are added or updated. Rows arriving with an older value require full reconciliation.', required: true, defaultValue: 'id' }),
    keyColumn: Property.ShortText({ displayName: 'Unique key column', required: true, defaultValue: 'id' }),
  },
  sampleData: {},
  async onEnable(context) {
    context.setSchedule({ intervalMs: 60000 });
    const scope = JSON.stringify(context.propsValue);
    if (context.isRepublish && await context.store.get('mysql-poll-scope') === scope) return;
    const rows = await read({ auth: context.auth.props, input: context.propsValue, latest: true, rateLimit: context.rateLimit });
    await context.store.put('mysql-poll-cursor', cursorOf({ row: rows[0], input: context.propsValue }));
    await context.store.put('mysql-poll-scope', scope);
  },
  async onDisable() {},
  async test(context) {
    return read({ auth: context.auth.props, input: context.propsValue, latest: true, rateLimit: context.rateLimit });
  },
  async run(context) {
    const cursor = await context.store.get<Cursor>('mysql-poll-cursor');
    const rows = await read({ auth: context.auth.props, input: context.propsValue, cursor, latest: false, rateLimit: context.rateLimit });
    if (rows.length) await context.store.put('mysql-poll-cursor', cursorOf({ row: rows.at(-1), input: context.propsValue }));
    return rows;
  },
});

async function read({ auth, input, cursor, latest, rateLimit }: ReadParams): Promise<Record<string, unknown>[]> {
  await rateLimit?.acquire({ bucket: 'mysql-query', scopeKey: JSON.stringify([auth.host, auth.port, auth.database]) });
  const client = await createConnection({ host: auth.host, port: auth.port, user: auth.user, password: auth.password, database: auth.database, supportBigNumbers: true, bigNumberStrings: true, dateStrings: true });
  try {
    const query = mysqlPolling.queryOf({ input, cursor, latest });
    const result: unknown = await client.query(query.sql, query.values);
    if (!Array.isArray(result) || !result.every(isObject)) throw new Error('Invalid MySQL rows');
    return result;
  } finally {
    await client.end();
  }
}

function queryOf({ input, cursor, latest }: { input: PollInput; cursor?: Cursor | null; latest: boolean }): { sql: string; values: (string | number)[] } {
  const table = sqlstring.escapeId(input.table);
  const order = sqlstring.escapeId(input.cursorColumn);
  const key = sqlstring.escapeId(input.keyColumn);
  const filter = !latest && cursor ? `WHERE (${order} > ? OR (${order} = ? AND ${key} > ?))` : '';
  const direction = latest ? 'DESC' : 'ASC';
  return { sql: `SELECT * FROM ${table} ${filter} ORDER BY ${order} ${direction}, ${key} ${direction} LIMIT ${latest ? 5 : 300}`, values: !latest && cursor ? [cursor.value, cursor.value, cursor.key] : [] };
}

function cursorOf({ row, input }: { row: Record<string, unknown> | undefined; input: PollInput }): Cursor | null {
  if (!row) return null;
  const value = row[input.cursorColumn];
  const key = row[input.keyColumn];
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof key !== 'string' && typeof key !== 'number')) throw new Error('Cursor and unique key columns must be non-null strings or numbers');
  return { value, key };
}

export const mysqlPolling = { queryOf };

type PollInput = { table: string; cursorColumn: string; keyColumn: string };
type Cursor = { value: string | number; key: string | number };
type ReadParams = { auth: { host: string; port: number; user: string; password: string; database?: string }; input: PollInput; cursor?: Cursor | null; latest: boolean; rateLimit?: { acquire: (params: { bucket: string; scopeKey: string }) => Promise<void> } };
