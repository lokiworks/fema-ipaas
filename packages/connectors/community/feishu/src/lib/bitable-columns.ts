import { Property, type InputPropertyMap, type RateLimitContext } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from './auth';
import { feishuCommon, type FeishuAuthValue } from './common';

export const bitableColumns = {
  listColumns,
  hasValues,
  propsFor,
  toRecordFields,
  cleanNamedFields,
  toMilliseconds,
};

export const bitableColumnProps = Property.DynamicProperties({
  displayName: 'Fields',
  description:
    'Every column of the selected data table is listed here. Fill in the ones to write and leave the rest empty.',
  auth: feishuAuth,
  required: false,
  refreshers: ['appToken', 'tableId'],
  props: async ({ auth, appToken, tableId }) => {
    if (!auth || typeof appToken !== 'string' || appToken.length === 0 || typeof tableId !== 'string' || tableId.length === 0) {
      return {};
    }
    const columns = await listColumns({ auth, appToken, tableId });
    return propsFor({ columns });
  },
});

async function listColumns({ auth, rateLimit, appToken, tableId }: ListColumnsParams): Promise<BitableColumn[]> {
  return feishuCommon.collectPages<BitableColumn>({
    auth,
    rateLimit,
    path: `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    queryParams: {},
    pageSize: 100,
    maxItems: 500,
  });
}

function propsFor({ columns }: { columns: BitableColumn[] }): InputPropertyMap {
  return Object.fromEntries(
    columns
      .filter((column) => !READ_ONLY_TYPES.includes(column.type))
      .map((column) => [column.field_id, propertyFor({ column })]),
  );
}

function propertyFor({ column }: { column: BitableColumn }) {
  if (column.type === COLUMN_TYPE.CHECKBOX) {
    return Property.Checkbox({ displayName: column.field_name, required: false });
  }
  return Property.ShortText({
    displayName: column.field_name,
    description: COLUMN_HINTS[column.type] ?? STRUCTURED_HINT,
    required: false,
  });
}

function toRecordFields({ columns, values }: { columns: BitableColumn[]; values: Record<string, unknown> }): Record<string, unknown> {
  const byId = new Map(columns.map((column) => [column.field_id, column]));
  return Object.fromEntries(
    Object.entries(values).flatMap(([fieldId, value]) => {
      const column = byId.get(fieldId);
      if (!column || READ_ONLY_TYPES.includes(column.type) || isBlankValue(value)) {
        return [];
      }
      return [[column.field_name, convert({ type: column.type, value })]];
    }),
  );
}

function hasValues({ values }: { values: Record<string, unknown> }): boolean {
  return Object.values(values).some((value) => !isBlankValue(value));
}

function cleanNamedFields(fields: unknown): Record<string, unknown> {
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([name]) => name.trim().length > 0)
      .map(([name, value]) => [name.trim(), value]),
  );
}

function convert({ type, value }: { type: number; value: unknown }): unknown {
  switch (type) {
    case COLUMN_TYPE.NUMBER:
      return typeof value === 'string' && NUMBER_PATTERN.test(value.trim()) ? Number(value.trim()) : value;
    case COLUMN_TYPE.DATE_TIME:
      return toMilliseconds(value) ?? value;
    case COLUMN_TYPE.MULTI_SELECT:
      return typeof value === 'string' ? splitOptions(value) : value;
    case COLUMN_TYPE.CHECKBOX:
      return value === true || value === 'true';
    case COLUMN_TYPE.URL:
      return typeof value === 'string' ? { text: value, link: value } : value;
    case COLUMN_TYPE.TEXT:
    case COLUMN_TYPE.SINGLE_SELECT:
    case COLUMN_TYPE.PHONE:
      return typeof value === 'string' ? value : JSON.stringify(value);
    default:
      return typeof value === 'string' ? parseJsonOr(value) : value;
  }
}

function toMilliseconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < SECONDS_UPPER_BOUND ? value * 1000 : value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (NUMBER_PATTERN.test(text)) {
    return toMilliseconds(Number(text));
  }
  const local = LOCAL_DATE_PATTERN.exec(text);
  if (local) {
    const [, year, month, day, hour, minute, second] = local;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour ?? 0), Number(minute ?? 0), Number(second ?? 0)) - BEIJING_OFFSET_MS;
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function splitOptions(value: string): unknown {
  const parsed = parseJsonOr(value);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  return value
    .split(/[,，、]/)
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
}

function parseJsonOr(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isBlankValue(value: unknown): boolean {
  return value === undefined || value === null || value === false || (typeof value === 'string' && value.trim().length === 0) || (Array.isArray(value) && value.length === 0);
}

const COLUMN_TYPE = {
  TEXT: 1,
  NUMBER: 2,
  SINGLE_SELECT: 3,
  MULTI_SELECT: 4,
  DATE_TIME: 5,
  CHECKBOX: 7,
  PHONE: 13,
  URL: 15,
} as const;

const READ_ONLY_TYPES: number[] = [19, 20, 1001, 1002, 1003, 1004, 1005];

const COLUMN_HINTS: Record<number, string> = {
  [COLUMN_TYPE.TEXT]: 'Text column.',
  [COLUMN_TYPE.NUMBER]: 'Number column.',
  [COLUMN_TYPE.SINGLE_SELECT]: 'Single-select column. Fill in the option name.',
  [COLUMN_TYPE.MULTI_SELECT]: 'Multi-select column. Separate options with commas, or reference a list.',
  [COLUMN_TYPE.DATE_TIME]: 'Date column. Reference a date field or type a date such as 2026-10-30. It is converted to a millisecond timestamp automatically.',
  [COLUMN_TYPE.PHONE]: 'Phone number column.',
  [COLUMN_TYPE.URL]: 'Link column. Fill in the URL.',
};

const STRUCTURED_HINT = 'Fill in the JSON this column type expects, for example [{"id":"ou_xxx"}] for a person column.';
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
const LOCAL_DATE_PATTERN = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const SECONDS_UPPER_BOUND = 100_000_000_000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export type BitableColumn = {
  field_id: string;
  field_name: string;
  type: number;
};

type ListColumnsParams = {
  auth: FeishuAuthValue;
  rateLimit?: RateLimitContext;
  appToken: string;
  tableId: string;
};
