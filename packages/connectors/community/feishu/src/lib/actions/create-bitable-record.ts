import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { bitableProps } from '../bitable-props';
import { feishuCommon } from '../common';

export const createBitableRecord = createAction({
  auth: feishuAuth,
  name: 'create_bitable_record',
  displayName: 'Create Bitable Record',
  description: 'Append one record to a Feishu Bitable data table',
  audience: 'both',
  classification: 'WRITE',
  aiMetadata: {
    description:
      'Append one record to a Feishu/Lark Bitable data table. Pick this to log an event, capture a form submission, or accumulate rows a team will review in Bitable. Field names must match the table column names exactly and the app needs bitable:app permission; every call inserts a new row, so retries duplicate.',
    idempotent: false,
  },
  props: {
    appToken: bitableProps.appToken,
    tableId: bitableProps.tableId,
    fields: Property.Object({
      displayName: 'Fields',
      description:
        'Keys are the column names of the data table and values are what to write. Use millisecond timestamps for date columns and arrays for multi-select columns.',
      required: true,
    }),
  },
  async run(context) {
    const { appToken, tableId, fields } = context.propsValue;
    const data = await feishuCommon.callApi<CreateRecordResponse>({
      auth: context.auth,
      method: HttpMethod.POST,
      path: `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      body: { fields },
    });
    return { record_id: data.record.record_id, ...data.record.fields };
  },
});

type CreateRecordResponse = {
  record: { record_id: string; fields: Record<string, unknown> };
};
