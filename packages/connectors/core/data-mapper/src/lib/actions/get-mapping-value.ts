import { createAction, Property } from '@fema-ipaas/connector-sdk';
import { AuthenticationType, httpClient, HttpMethod } from '@fema-ipaas/connector-common';

export const getMappingValue = createAction({
  name: 'get_mapping_value', displayName: 'Look up a mapping', description: 'Look up a binding without failing when it is missing', requireAuth: false, classification: 'READ',
  aiMetadata: { idempotent: true }, props: { tableId: Property.ShortText({ displayName: 'Mapping table', required: true }), key: Property.ShortText({ displayName: 'Key', required: true }) },
  outputSchema: { fields: [{ key: 'found' }, { key: 'value' }] },
  async run(context) {
    const response = await httpClient.sendRequest<{ rows: { k: string; v: string }[] }>({ method: HttpMethod.GET, url: `${context.server.apiUrl.replace(/\/$/, '')}/v1/worker/mapping-tables/${encodeURIComponent(context.propsValue.tableId)}`, authentication: { type: AuthenticationType.BEARER_TOKEN, token: context.server.token } });
    const row = response.body.rows.find((item) => item.k === context.propsValue.key);
    return { found: !!row, value: row?.v ?? null };
  },
});
