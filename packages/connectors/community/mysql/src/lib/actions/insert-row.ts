import { createAction, Property } from '@fema-ipaas/connector-sdk';
import { mysqlCommon, mysqlConnect, sanitizeColumnName } from '../common';
import { mysqlAuth } from '../auth';
import { insertRowOutputSchema } from '../output-schemas';

export default createAction({
  auth: mysqlAuth,
  name: 'insert_row',
  displayName: 'Insert Row',
  description: 'Inserts a new row into a table',
  classification: 'WRITE',
  audience: 'both',
  outputSchema: insertRowOutputSchema,
  aiMetadata: { description: 'Inserts a new row into a MySQL table from a map of column names to values. Use to add a record. Not idempotent: each call performs a fresh INSERT, so repeating it adds duplicate rows (or errors on a unique-key collision).', idempotent: false },
  reliability: { writeSafety: 'UNSAFE', rateLimits: [{ bucket: 'mysql-query', scope: 'APP', perSecond: 50 }] },
  props: {
    timezone: mysqlCommon.timezone,
    table: mysqlCommon.table(),
    values: Property.Object({
      displayName: 'Values',
      required: true,
    }),
  },
  async run(context) {
    await context.rateLimit.acquire({ bucket: 'mysql-query', scopeKey: JSON.stringify([context.auth.props.host, context.auth.props.port, context.auth.props.database]) });
    const fields = Object.keys(context.propsValue.values);
    const qsFields = fields.map((f) => sanitizeColumnName(f)).join(',');
    const qsValues = fields.map(() => '?').join(',');
    const qs = `INSERT INTO ${sanitizeColumnName(context.propsValue.table)} (${qsFields}) VALUES (${qsValues});`;
    const conn = await mysqlConnect(context.auth, context.propsValue);
    try {
      const values = fields.map((f) => context.propsValue.values[f]);
      const result = await conn.query(qs, values);
      return result;
    } finally {
      await conn.end();
    }
  },
});
