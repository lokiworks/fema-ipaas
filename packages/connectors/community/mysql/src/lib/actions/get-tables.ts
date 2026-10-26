import { createAction } from '@fema-ipaas/connector-sdk';
import { mysqlConnect, mysqlGetTableNames } from '../common';
import { mysqlAuth } from '../auth';
import { getTablesOutputSchema } from '../output-schemas';

export default createAction({
  auth: mysqlAuth,
  name: 'get_tables',
  displayName: 'Get Tables',
  description: 'Returns a list of tables in the database',
  classification: 'READ',
  audience: 'both',
  outputSchema: getTablesOutputSchema,
  aiMetadata: { description: 'Lists the names of all tables in the connected MySQL database (SHOW TABLES). Use to discover the schema before reading or writing rows. Takes no input; read-only and idempotent.', idempotent: true },
  reliability: { rateLimits: [{ bucket: 'mysql-query', scope: 'APP', perSecond: 50 }] },
  props: {},
  async run(context) {
    await context.rateLimit.acquire({ bucket: 'mysql-query', scopeKey: JSON.stringify([context.auth.props.host, context.auth.props.port, context.auth.props.database]) });
    const conn = await mysqlConnect(context.auth, context.propsValue);
    try {
      const tables = await mysqlGetTableNames(conn);
      return { tables };
    } finally {
      await conn.end();
    }
  },
});
