import { createAction } from '@fema-ipaas/connector-sdk';
import { postgresAuth } from '../..';
import { pgClient, postgresUtils } from '../common';
import { getTablesOutputSchema } from '../output-schemas';

export const getTables = createAction({
  auth: postgresAuth,
  name: 'get-tables',
  classification: 'SEARCH',
  displayName: 'Get Tables',
  description: 'Returns the tables in the database',
  audience: 'both',
  outputSchema: getTablesOutputSchema,
  aiMetadata: {
    description: 'Lists every base table in the connected PostgreSQL database, each with its schema and table name. Use to discover the schema before reading or writing rows. Takes no input; read-only and idempotent.',
    idempotent: true,
  },
  reliability: { rateLimits: [{ bucket: 'postgres-query', scope: 'APP', perSecond: 50 }] },
  props: {},
  async run(context) {
    await context.rateLimit.acquire({ bucket: 'postgres-query', scopeKey: JSON.stringify([context.auth.props.host, context.auth.props.port, context.auth.props.database]) });
    const client = await pgClient(context.auth);
    try {
      const tables = await postgresUtils.listTables(client);
      return { tables };
    } finally {
      await client.end();
    }
  },
});
