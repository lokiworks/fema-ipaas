import { AuthenticationType, httpClient, HttpMethod } from '@fema-ipaas/connector-common';
import { createAction, fixOwnerMarker, Property } from '@fema-ipaas/connector-sdk';
import { z } from 'zod';

export const upsertMappingRows = createAction({
  name: 'upsert_mapping_rows', displayName: 'Save mapping table rows',
  description: 'Add missing bindings and report conflicting values', requireAuth: false,
  classification: 'WRITE', audience: 'both', reliability: { writeSafety: 'IDEMPOTENT' },
  aiMetadata: { description: 'Save key and value pairs in a project mapping table. Existing values are preserved unless Replace is selected. Safe to repeat.', idempotent: true },
  props: {
    tableId: Property.ShortText({ displayName: 'Mapping table', required: true }),
    rows: Property.Json({ displayName: 'Rows', description: 'An array of objects with key and value fields.', required: true }),
    onConflict: Property.StaticDropdown({ displayName: 'When a value differs', required: false, defaultValue: 'KEEP', options: { options: [{ label: 'Keep the existing value', value: 'KEEP' }, { label: 'Replace the existing value', value: 'REPLACE' }] } }),
  },
  outputSchema: { fields: [{ key: 'inserted' }, { key: 'replaced' }, { key: 'conflicts', listItems: [{ key: 'key' }, { key: 'existing' }, { key: 'proposed' }] }] },
  async run(context) {
    const rows = z.array(z.object({ key: z.string(), value: z.string() })).parse(context.propsValue.rows);
    const response = await httpClient.sendRequest<UpsertResult>({
      method: HttpMethod.POST,
      url: `${context.server.apiUrl.replace(/\/$/, '')}/v1/worker/mapping-tables/${encodeURIComponent(context.propsValue.tableId)}/rows`,
      authentication: { type: AuthenticationType.BEARER_TOKEN, token: context.server.token },
      body: { rows, onConflict: context.propsValue.onConflict ?? 'KEEP' },
    });
    if (response.body.conflicts.length > 0) {
      throw new Error(fixOwnerMarker.attach({ message: `Mapping values conflict for ${response.body.conflicts.map((item) => item.key).join(', ')}`, owner: 'MAPPING_OWNER' }));
    }
    return response.body;
  },
});

type UpsertResult = { inserted: number; replaced: number; conflicts: { key: string; existing: string; proposed: string }[] };
