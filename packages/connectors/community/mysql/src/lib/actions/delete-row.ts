import { createAction, Property } from '@fema-ipaas/connector-sdk';
import { mysqlCommon, mysqlConnect, sanitizeColumnName, warningMarkdown } from '../common';
import { mysqlAuth } from '../auth';
import { deleteRowOutputSchema } from '../output-schemas';

export default createAction({
  auth: mysqlAuth,
  name: 'delete_row',
  displayName: 'Delete Row',
  description: 'Deletes one or more rows from a table',
  classification: 'DESTRUCTIVE',
  audience: 'both',
  outputSchema: deleteRowOutputSchema,
  aiMetadata: { description: 'Deletes every row in a MySQL table whose search column equals a given value. Use to remove records matched by a single column. Idempotent: once the matching rows are gone, re-running with the same input deletes nothing further.', idempotent: true },
  reliability: { writeSafety: 'IDEMPOTENT', rateLimits: [{ bucket: 'mysql-query', scope: 'APP', perSecond: 50 }] },
  props: {
    markdown: warningMarkdown,
    timezone: mysqlCommon.timezone,
    table: mysqlCommon.table(),
    search_column: Property.ShortText({
      displayName: 'Search Column',
      required: true,
    }),
    search_value: Property.ShortText({
      displayName: 'Search Value',
      required: true,
    }),
  },
  async run(context) {
    await context.rateLimit.acquire({ bucket: 'mysql-query', scopeKey: JSON.stringify([context.auth.props.host, context.auth.props.port, context.auth.props.database]) });
    const tableName = sanitizeColumnName(context.propsValue.table);
    const searchColumn = sanitizeColumnName(context.propsValue.search_column);
    const searchValue = context.propsValue.search_value;

    const queryString = `DELETE FROM ${tableName} WHERE ${searchColumn}=?;`;

    const connection = await mysqlConnect(context.auth, context.propsValue);
    try {
      const result = await connection.query(queryString, [searchValue]);
      return result;
    } finally {
      await connection.end();
    }
  },
});
