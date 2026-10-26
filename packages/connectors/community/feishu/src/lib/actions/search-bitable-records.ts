import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction, type RateLimitContext } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { bitableProps } from '../bitable-props';
import { feishuCommon, type FeishuAuthValue } from '../common';

export const searchBitableRecords = createAction({
  auth: feishuAuth,
  name: 'search_bitable_records',
  displayName: 'Search Bitable Records',
  description: 'Query records from a Feishu Bitable data table and return them as a flat list',
  audience: 'both',
  classification: 'SEARCH',
  aiMetadata: {
    description:
      'Query rows from a Feishu/Lark Bitable data table, optionally filtered to one column matching one value, and return them as a flat list. Pick this to read reference data or to check whether a row already exists before writing one. It follows the page token until the requested number of records is reached or the table runs out, and never modifies the table.',
    idempotent: true,
  },
  reliability: { rateLimits: [{ bucket: 'bitable', scope: 'APP_ENDPOINT', perSecond: 50 }] },
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
      displayName: 'Maximum Records',
      description: 'How many records to return at most, up to 5000. Feishu serves 500 per call, so a larger number takes several calls.',
      required: false,
      defaultValue: 100,
    }),
  },
  async run(context) {
    const { appToken, tableId, filterField, filterValue, pageSize } = context.propsValue;
    const records = await collectRecords({
      auth: context.auth,
      rateLimit: context.rateLimit,
      path: `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`,
      body: buildFilter(filterField, filterValue),
      maxRecords: Math.min(Math.max(pageSize ?? DEFAULT_MAX_RECORDS, 1), MAX_RECORDS),
    });
    return records.map((item) => ({
      record_id: item.record_id,
      ...item.fields,
    }));
  },
});

async function collectRecords({ auth, rateLimit, path, body, maxRecords }: CollectRecordsParams): Promise<RecordItem[]> {
  const collected: RecordItem[] = [];
  let pageToken: string | undefined = undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: SearchRecordsResponse = await feishuCommon.callApi<SearchRecordsResponse>({
      auth,
      rateLimit,
      method: HttpMethod.POST,
      path,
      queryParams: {
        page_size: String(Math.min(maxRecords - collected.length, PAGE_SIZE)),
        ...(pageToken ? { page_token: pageToken } : {}),
      },
      body,
    });
    collected.push(...(data.items ?? []));
    if (collected.length >= maxRecords || !data.has_more || !data.page_token) {
      return collected.slice(0, maxRecords);
    }
    pageToken = data.page_token;
  }
  return collected;
}

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

const DEFAULT_MAX_RECORDS = 100;

const MAX_RECORDS = 5000;

const PAGE_SIZE = 500;

const MAX_PAGES = 20;

type RecordItem = { record_id: string; fields: Record<string, unknown> };

type SearchRecordsResponse = {
  items?: RecordItem[];
  has_more?: boolean;
  page_token?: string;
};

type CollectRecordsParams = {
  auth: FeishuAuthValue;
  rateLimit?: RateLimitContext;
  path: string;
  body: Record<string, unknown>;
  maxRecords: number;
};
