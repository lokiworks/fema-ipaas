import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { bitableProps } from '../bitable-props';
import { feishuCommon } from '../common';
import { feishuIdempotency } from '../common/idempotency';

export const createBitableRecord = createAction({
  auth: feishuAuth,
  name: 'create_bitable_record',
  displayName: 'Create Bitable Record',
  description: 'Append one record to a Feishu Bitable data table',
  audience: 'both',
  classification: 'WRITE',
  aiMetadata: {
    description:
      'Append one record to a Feishu/Lark Bitable data table. Pick this to log an event, capture a form submission, or accumulate rows a team will review in Bitable. Field names must match the table column names exactly and the app needs bitable:app permission; every call inserts a new row unless a Dedupe Key is given, in which case repeats of the same key are applied once. The app must also be added to the Bitable as a collaborator that can edit it.',
    idempotent: false,
  },
  reliability: { writeSafety: 'UNSAFE', rateLimits: [{ bucket: 'bitable', scope: 'APP_ENDPOINT', perSecond: 50 }] },
  props: {
    appToken: bitableProps.appToken,
    tableId: bitableProps.tableId,
    fields: Property.Object({
      displayName: 'Fields',
      description:
        'Keys are the column names of the data table and values are what to write. Use millisecond timestamps for date columns and arrays for multi-select columns.',
      required: true,
    }),
    dedupeKey: Property.ShortText({
      displayName: 'Dedupe Key',
      description:
        'Optional. Calls with the same key add the row only once, so a retried step does not duplicate it. Use something unique to this row, for example the employee number plus the event.',
      required: false,
    }),
  },
  async run(context) {
    const { appToken, tableId, fields, dedupeKey } = context.propsValue;
    const data = await feishuCommon.callApi<CreateRecordResponse>({
      auth: context.auth,
      rateLimit: context.rateLimit,
      method: HttpMethod.POST,
      path: `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      ...(dedupeKey ? { queryParams: { client_token: feishuIdempotency.uuidFrom({ seed: `${appToken}:${tableId}:${dedupeKey}` }) } } : {}),
      body: { fields },
    });
    return { record_id: data.record.record_id, ...data.record.fields };
  },
});

type CreateRecordResponse = {
  record: { record_id: string; fields: Record<string, unknown> };
};
