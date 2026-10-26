import { AuthenticationType, httpClient, HttpMethod } from '@fema-ipaas/connector-common';
import { createAction, Property } from '@fema-ipaas/connector-sdk';

export const getMappingRows = createAction({
  name: 'get_mapping_rows', displayName: 'Read mapping table rows', description: 'Read the latest project mapping table bindings', requireAuth: false, classification: 'READ',
  aiMetadata: { description: 'Read a project mapping table without modifying it.', idempotent: true },
  props: { tableId: Property.ShortText({ displayName: 'Mapping table', required: true }) },
  outputSchema: { fields: [{ key: 'bindings', label: 'Bindings' }, { key: 'rows', listItems: [{ key: 'k' }, { key: 'v' }] }] },
  async run(context) {
    const response = await httpClient.sendRequest<{ rows: { k: string; v: string }[] }>({ method: HttpMethod.GET, url: `${context.server.apiUrl.replace(/\/$/, '')}/v1/worker/mapping-tables/${encodeURIComponent(context.propsValue.tableId)}`, authentication: { type: AuthenticationType.BEARER_TOKEN, token: context.server.token } });
    return { rows: response.body.rows, bindings: Object.fromEntries(response.body.rows.map((row) => [row.k, row.v])) };
  },
});
