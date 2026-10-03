import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { QUERY_TYPE_OPTIONS, STATUS_SCOPE_OPTIONS, StatusScope, beisenTimeWindow } from '../common/time-window';

export const searchChangedEmployees = createAction({
  auth: beisenAuth,
  name: 'search_changed_employees',
  displayName: 'Search Changed Employees',
  description: 'Roll through employees whose records changed inside a time window',
  audience: 'both',
  classification: 'SEARCH',
  aiMetadata: {
    description:
      'Page through Beisen employees whose records changed between two timestamps, using the scroll cursor the API returns. Pick this to sync HR master data into another system incrementally rather than re-reading every employee. Beisen returns at most 300 rows per call, so keep passing the returned scroll_id back until has_more is false, within 10 seconds of each call; it never modifies Beisen data.',
    idempotent: true,
  },
  props: {
    startTime: Property.ShortText({
      displayName: 'Start Time',
      description: 'Beginning of the change window, for example 2026-09-01T00:00:00. The window can span at most 90 days.',
      required: true,
    }),
    stopTime: Property.ShortText({
      displayName: 'Stop Time',
      description: 'End of the change window, for example 2026-09-08T00:00:00.',
      required: true,
    }),
    statusScope: Property.StaticDropdown({
      displayName: 'Employee Status',
      description: 'Which employees to return. Departed employees are only returned when this is Departed or Every status.',
      required: true,
      defaultValue: 'ACTIVE',
      options: { options: STATUS_SCOPE_OPTIONS },
    }),
    queryType: Property.StaticDropdown({
      displayName: 'What Counts As A Change',
      required: true,
      defaultValue: 2,
      options: { options: QUERY_TYPE_OPTIONS },
    }),
    columns: Property.Array({
      displayName: 'Columns',
      description:
        'Field codes to fetch. Leave empty to fetch everything; this only decides which values are queried, the response keeps its full shape.',
      required: false,
    }),
    scrollId: Property.ShortText({
      displayName: 'Scroll ID',
      description:
        'Leave empty on the first call. On later calls pass the scroll_id returned by the previous one, within 10 seconds.',
      required: false,
    }),
  },
  async run(context) {
    const { startTime, stopTime, statusScope, queryType, columns, scrollId } = context.propsValue;
    const page = await beisenTimeWindow.fetchPage({
      auth: context.auth,
      body: beisenTimeWindow.requestBody({
        startTime,
        stopTime,
        scope: toScope(statusScope),
        queryType: queryType === 1 ? 1 : 2,
        capacity: PAGE_SIZE,
        scrollId,
        columns: (columns ?? []).filter((column): column is string => typeof column === 'string'),
      }),
    });
    return {
      records: page.records,
      count: page.records.length,
      scroll_id: page.scrollId ?? null,
      has_more: page.records.length > 0 && Boolean(page.scrollId),
    };
  },
});

function toScope(value: unknown): StatusScope {
  return value === 'LEFT' || value === 'ONBOARDING' || value === 'ALL' ? value : 'ACTIVE';
}

const PAGE_SIZE = 300;
