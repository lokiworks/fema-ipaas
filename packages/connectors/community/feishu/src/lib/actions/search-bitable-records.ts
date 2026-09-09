import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { bitableProps } from '../bitable-props';
import { feishuCommon } from '../common';

export const searchBitableRecords = createAction({
  auth: feishuAuth,
  name: 'search_bitable_records',
  displayName: 'Search Bitable Records',
  description: 'Query records from a Feishu Bitable data table and return them as a flat list',
  audience: 'both',
  classification: 'SEARCH',
  aiMetadata: {
    description:
      'Query rows from a Feishu/Lark Bitable data table, optionally filtered to one column matching one value, and return them as a flat list. Pick this to read reference data or to check whether a row already exists before writing one. Returns at most the requested page size and never modifies the table.',
    idempotent: true,
  },
  props: {
    appToken: bitableProps.appToken,
    tableId: bitableProps.tableId,
    filterField: Property.ShortText({
      displayName: 'Filter Column',
      description: 'Leave empty to return every record, or name a column to filter on.',
      required: false,
    }),
    filterValue: Property.ShortText({
      displayName: 'Filter Value',
      description: 'The value the filter column must equal.',
      required: false,
    }),
    pageSize: Property.Number({
      displayName: 'Page Size',
      description: 'Up to 500 records.',
      required: false,
      defaultValue: 100,
    }),
  },
  async run(context) {
    const { appToken, tableId, filterField, filterValue, pageSize } = context.propsValue;
    const data = await feishuCommon.callApi<SearchRecordsResponse>({
      auth: context.auth,
      method: HttpMethod.POST,
      path: `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`,
      queryParams: { page_size: String(pageSize ?? 100) },
      body: buildFilter(filterField, filterValue),
    });
    return (data.items ?? []).map((item) => ({
      record_id: item.record_id,
      ...item.fields,
    }));
  },
});

function buildFilter(field: string | undefined, value: string | undefined): Record<string, unknown> {
  if (!field || value === undefined || value === '') {
    return {};
  }
  return {
    filter: {
      conjunction: 'and',
      conditions: [{ field_name: field, operator: 'is', value: [value] }],
    },
  };
}

type SearchRecordsResponse = {
  items?: { record_id: string; fields: Record<string, unknown> }[];
};
