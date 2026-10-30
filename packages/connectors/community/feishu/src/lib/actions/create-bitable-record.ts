import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { bitableColumnProps, bitableColumns } from '../bitable-columns';
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
      'Append one record to a Feishu/Lark Bitable data table. Pick this to log an event, capture a form submission, or accumulate rows a team will review in Bitable. Pick the columns from the Fields list of the selected table (date columns accept a date and are converted to milliseconds), or pass an object keyed by exact column names; the app needs bitable:app permission; every call inserts a new row unless a Dedupe Key is given, in which case repeats of the same key are applied once. The app must also be added to the Bitable as a collaborator that can edit it.',
    idempotent: false,
  },
  reliability: { writeSafety: 'UNSAFE', rateLimits: [{ bucket: 'bitable', scope: 'APP_ENDPOINT', perSecond: 50 }] },
  props: {
    appToken: bitableProps.appToken,
    tableId: bitableProps.tableId,
    columns: bitableColumnProps,
    fields: Property.Object({
      displayName: 'More Fields by Column Name',
      description:
        'Optional. Keys are column names and values are what to write, sent as they are. Use it to pass a whole object from an earlier node; for single columns prefer the Fields list above, which converts dates for you.',
      required: false,
      advanced: true,
    }),
    dedupeKey: Property.ShortText({
      displayName: 'Dedupe Key',
      description:
        'Optional. Calls with the same key add the row only once, so a retried step does not duplicate it. Use something unique to this row, for example the employee number plus the event.',
      required: false,
    }),
  },
  async run(context) {
    const { appToken, tableId, fields, columns, dedupeKey } = context.propsValue;
    const columnValues = columns ?? {};
    const fromColumns = bitableColumns.hasValues({ values: columnValues })
      ? bitableColumns.toRecordFields({
          columns: await bitableColumns.listColumns({ auth: context.auth, rateLimit: context.rateLimit, appToken, tableId }),
          values: columnValues,
        })
      : {};
    const recordFields = { ...bitableColumns.cleanNamedFields(fields), ...fromColumns };
    if (Object.keys(recordFields).length === 0) {
      throw new Error(NO_FIELDS_MESSAGE);
    }
    const data = await feishuCommon.callApi<CreateRecordResponse>({
      auth: context.auth,
      rateLimit: context.rateLimit,
      method: HttpMethod.POST,
      path: `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      ...(dedupeKey ? { queryParams: { client_token: feishuIdempotency.uuidFrom({ seed: `${appToken}:${tableId}:${dedupeKey}` }) } } : {}),
      body: { fields: recordFields },
    });
    return { record_id: data.record.record_id, ...data.record.fields };
  },
});

const NO_FIELDS_MESSAGE = 'Nothing to write: fill in at least one column under Fields. Rows with an empty column name are ignored.';

type CreateRecordResponse = {
  record: { record_id: string; fields: Record<string, unknown> };
};
