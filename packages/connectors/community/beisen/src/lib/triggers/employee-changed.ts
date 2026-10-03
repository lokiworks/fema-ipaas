import {
  DedupeStrategy,
  Polling,
  pollingHelper,
} from '@fema-ipaas/connector-common';
import {
  ConnectionValueForAuthProperty,
  Property,
  TriggerStrategy,
  createTrigger,
} from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { beisenCommon } from '../common';
import {
  QUERY_TYPE_OPTIONS,
  STATUS_SCOPE_OPTIONS,
  StatusScope,
  beisenTimeWindow,
} from '../common/time-window';

const polling: Polling<
  ConnectionValueForAuthProperty<typeof beisenAuth>,
  {
    statusScope?: unknown;
    queryType?: unknown;
    timezone?: string | undefined;
    filterColumn?: string | undefined;
    filterValues?: unknown[] | undefined;
  }
> = {
  strategy: DedupeStrategy.TIMEBASED,
  items: async ({ auth, propsValue, lastFetchEpochMS }) => {
    const stopMs = Date.now();
    const startMs = lastFetchEpochMS === 0 ? stopMs - INITIAL_LOOKBACK_MS : lastFetchEpochMS;
    const fetched = await beisenTimeWindow.drain({
      auth,
      scope: toScope(propsValue.statusScope),
      queryType: toQueryType(propsValue.queryType),
      startMs,
      stopMs,
      timeZone: propsValue.timezone ?? DEFAULT_TIMEZONE,
    });
    const records = beisenCommon.filterByColumn({
      records: fetched,
      column: propsValue.filterColumn,
      values: toStringList(propsValue.filterValues),
    });
    return records.map((record) => ({ epochMilliSeconds: stopMs, data: record }));
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
      'Start a workflow for each Beisen employee whose employee info or employment record changed since the previous check, one run per employee. Each run carries employeeInfo (name, mobile, email, userID) and recordInfo (job number, department OId, employee status, change type, last work date). Pick it to keep another system in step with Beisen as the HR source of truth; choose the status scope to separate onboarding, active and departed employees. It drains every scroll page and every 89-day segment, and it only reads.',
  },
  type: TriggerStrategy.POLLING,
  props: {
    statusScope: Property.StaticDropdown({
      displayName: 'Employee Status',
      description:
        'Which employees to watch. Departed employees are only returned when this is Departed or Every status, and a leaving only counts once it is in effect, which is after the last work day.',
      required: true,
      defaultValue: 'ACTIVE',
      options: { options: STATUS_SCOPE_OPTIONS },
    }),
    queryType: Property.StaticDropdown({
      displayName: 'What Counts As A Change',
      description:
        'Business changes ignore the nightly system job that recalculates tenure, which otherwise makes unchanged employees show up every day.',
      required: true,
      defaultValue: 2,
      options: { options: QUERY_TYPE_OPTIONS },
    }),
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
    filterColumn: Property.ShortText({
      displayName: 'Only When This Field',
      description:
        'Optional. A field path inside the returned record, for example recordInfo.changeTypeOID. Together with the values below it keeps only records where that field matches, which is how you pick new hires (1) or rehires (2) out of all changes.',
      required: false,
    }),
    filterValues: Property.Array({
      displayName: 'Has One Of These Values',
      description: 'The trigger only starts for records whose field above equals one of these values. Ignored when the field is empty.',
      required: false,
    }),
  },
  sampleData: {
    originalId: null,
    employeeInfo: {
      userID: 100234,
      name: '王五',
      email: 'wangwu@example.com',
      mobilePhone: '13800000000',
      objectId: '00884bc4-31f2-4d42-9b35-287e69867fa2',
    },
    recordInfo: {
      userID: 100234,
      jobNumber: 'E10023',
      oIdDepartment: 20301,
      employeeStatus: '2',
      changeTypeOID: '1',
      startDate: '2026-10-08T00:00:00',
      lastWorkDate: null,
    },
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

function toScope(value: unknown): StatusScope {
  return value === 'LEFT' || value === 'ONBOARDING' || value === 'ALL' ? value : 'ACTIVE';
}

function toQueryType(value: unknown): number {
  return value === 1 ? 1 : 2;
}

function toStringList(values: unknown[] | undefined): string[] {
  if (!values) {
    return [];
  }
  return values.filter((value): value is string => typeof value === 'string');
}

const DEFAULT_TIMEZONE = 'Asia/Shanghai';

const INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
