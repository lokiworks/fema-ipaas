import {
  DedupeStrategy,
  Polling,
  pollingHelper,
  HttpMethod,
} from '@fema-ipaas/connector-common';
import {
  ConnectionValueForAuthProperty,
  Property,
  TriggerStrategy,
  createTrigger,
} from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { beisenCommon } from '../common';

const polling: Polling<
  ConnectionValueForAuthProperty<typeof beisenAuth>,
  { columns?: unknown[] | undefined; timezone?: string | undefined }
> = {
  strategy: DedupeStrategy.TIMEBASED,
  items: async ({ auth, propsValue, lastFetchEpochMS }) => {
    const stopTime = Date.now();
    const startTime = lastFetchEpochMS === 0 ? stopTime - INITIAL_LOOKBACK_MS : lastFetchEpochMS;
    const timezone = propsValue.timezone ?? DEFAULT_TIMEZONE;
    const records = await drainTimeWindow({
      auth,
      startTime: formatTimestamp(startTime, timezone),
      stopTime: formatTimestamp(stopTime, timezone),
      columns: toStringList(propsValue.columns),
    });
    return records.map((record) => ({ epochMilliSeconds: stopTime, data: record }));
  },
};

export const employeeChanged = createTrigger({
  auth: beisenAuth,
  name: 'employee_changed',
  displayName: 'Employee Changed',
  description: 'Starts the workflow for every employee whose record changed since the last check',
  classification: 'READ',
  aiMetadata: {
    description:
      'Start a workflow for each Beisen employee whose record changed since the previous check, one run per employee. Pick this to keep another system in step with Beisen as the HR source of truth without writing the polling window yourself. It drains every scroll page so a change affecting more than one page is not lost, and it reads only.',
  },
  type: TriggerStrategy.POLLING,
  props: {
    timezone: Property.StaticDropdown({
      displayName: 'Timezone',
      description:
        'The timezone Beisen reads the query window in. If this trigger keeps returning nothing while employees are clearly changing, this is the first setting to change.',
      required: true,
      defaultValue: 'Asia/Shanghai',
      options: {
        options: [
          { label: 'Beijing time (UTC+8)', value: 'Asia/Shanghai' },
          { label: 'UTC', value: 'UTC' },
        ],
      },
    }),
    columns: Property.Array({
      displayName: 'Columns',
      description:
        'Field names to return, for example UserID, Name, EmployeeNumber. Leave empty to let Beisen decide.',
      required: false,
    }),
  },
  sampleData: {
    UserID: '00884bc4-31f2-4d42-9b35-287e69867fa2',
    Name: '王五',
    EmployeeNumber: 'E10023',
  },
  async test(context) {
    return pollingHelper.test(polling, context);
  },
  async onEnable(context) {
    await pollingHelper.onEnable(polling, context);
  },
  async onDisable(context) {
    await pollingHelper.onDisable(polling, context);
  },
  async run(context) {
    return pollingHelper.poll(polling, context);
  },
});

async function drainTimeWindow({
  auth,
  startTime,
  stopTime,
  columns,
}: DrainParams): Promise<Record<string, unknown>[]> {
  const collected: Record<string, unknown>[] = [];
  let scrollId: string | undefined = undefined;
  for (let page = 0; page < MAX_PAGES_PER_POLL; page++) {
    const response: TimeWindowResponse = await beisenCommon.callApi<TimeWindowResponse>({
      auth,
      method: HttpMethod.POST,
      path: '/TenantBasePublicApiV2/v2/employee/timewindow/search',
      body: {
        startTime,
        stopTime,
        capacity: PAGE_SIZE,
        isWithDeleted: false,
        ...(scrollId ? { scrollId } : {}),
        ...(columns.length > 0 ? { columns } : {}),
      },
    });
    const page_records = response.data ?? [];
    collected.push(...page_records);
    if (page_records.length === 0 || !response.scrollId) {
      break;
    }
    scrollId = response.scrollId;
  }
  return collected;
}

function toStringList(values: unknown[] | undefined): string[] {
  if (!values) {
    return [];
  }
  return values.filter((value): value is string => typeof value === 'string');
}

function formatTimestamp(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(epochMs));
}

const DEFAULT_TIMEZONE = 'Asia/Shanghai';

const PAGE_SIZE = 100;

const MAX_PAGES_PER_POLL = 100;

const INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type DrainParams = {
  auth: ConnectionValueForAuthProperty<typeof beisenAuth>;
  startTime: string;
  stopTime: string;
  columns: string[];
};

type TimeWindowResponse = {
  data?: Record<string, unknown>[];
  scrollId?: string;
};
