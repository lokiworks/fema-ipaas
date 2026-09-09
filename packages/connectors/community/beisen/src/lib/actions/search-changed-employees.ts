import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { beisenCommon } from '../common';

export const searchChangedEmployees = createAction({
  auth: beisenAuth,
  name: 'search_changed_employees',
  displayName: 'Search Changed Employees',
  description: 'Roll through employees whose records changed inside a time window',
  audience: 'both',
  classification: 'SEARCH',
  aiMetadata: {
    description:
      'Page through Beisen employees whose records changed between two timestamps, using the scroll cursor the API returns. Pick this to sync HR master data into another system incrementally rather than re-reading every employee. Beisen returns at most a few hundred rows per call, so keep passing the returned scroll_id back until has_more is false; it never modifies Beisen data.',
    idempotent: true,
  },
  props: {
    startTime: Property.ShortText({
      displayName: 'Start Time',
      description: 'Beginning of the change window, for example 2026-09-01 00:00:00.',
      required: true,
    }),
    stopTime: Property.ShortText({
      displayName: 'Stop Time',
      description: 'End of the change window, for example 2026-09-08 00:00:00.',
      required: true,
    }),
    columns: Property.Array({
      displayName: 'Columns',
      description:
        'Field names to return, for example UserID, Name, EmployeeNumber. Leave empty to let Beisen decide.',
      required: false,
    }),
    capacity: Property.Number({
      displayName: 'Batch Size',
      description: 'Rows per call. Beisen caps this at 100.',
      required: false,
      defaultValue: 100,
    }),
    scrollId: Property.ShortText({
      displayName: 'Scroll ID',
      description:
        'Leave empty on the first call. On later calls pass the scroll_id returned by the previous one.',
      required: false,
    }),
    isWithDeleted: Property.Checkbox({
      displayName: 'Include Deleted',
      description: 'Include records deleted inside the window.',
      required: false,
      defaultValue: false,
    }),
  },
  async run(context) {
    const { startTime, stopTime, columns, capacity, scrollId, isWithDeleted } =
      context.propsValue;
    const data = await beisenCommon.callApi<TimeWindowResponse>({
      auth: context.auth,
      method: HttpMethod.POST,
      path: '/TenantBasePublicApiV2/v2/employee/timewindow/search',
      body: {
        startTime,
        stopTime,
        capacity: capacity ?? 100,
        isWithDeleted: isWithDeleted ?? false,
        ...(scrollId ? { scrollId } : {}),
        ...(columns && columns.length > 0 ? { columns } : {}),
      },
    });
    const records = data.data ?? [];
    return {
      records,
      count: records.length,
      scroll_id: data.scrollId ?? null,
      has_more: records.length > 0 && Boolean(data.scrollId),
    };
  },
});

type TimeWindowResponse = {
  data?: Record<string, unknown>[];
  scrollId?: string;
};
