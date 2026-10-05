import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { beisenCommon } from '../common';

export const getEmploymentRecords = createAction({
  auth: beisenAuth,
  name: 'get_employment_records',
  displayName: 'Get Employment Records',
  description: 'Fetch the employment records of specific employees by their Beisen user IDs',
  audience: 'both',
  classification: 'READ',
  aiMetadata: {
    description:
      'Read the employment records — department, job, position, employment status — for a list of Beisen user IDs. Pick this after Search Changed Employees when you hold user IDs and need the job details behind them. It returns the effective main-post record of each person that is not deleted. Beisen accepts at most 300 IDs per call, so longer lists are split into several calls here; it never modifies Beisen data.',
    idempotent: true,
  },
  props: {
    userIds: Property.Array({
      displayName: 'User IDs',
      description: 'Beisen UserID values, one per entry.',
      required: true,
    }),
  },
  async run(context) {
    const ids = toUserIds({ values: context.propsValue.userIds });
    const batches = beisenCommon.chunk({ items: ids, size: BATCH_SIZE });
    const results: unknown[] = [];
    for (const batch of batches) {
      const records = await beisenCommon.callBusinessApi<unknown[]>({
        auth: context.auth,
        method: HttpMethod.POST,
        path: '/TenantBaseExternal/api/v5/Employee/GetServiceInfoByIds',
        body: { oIds: batch },
      });
      results.push(...(records ?? []));
    }
    return results;
  },
});

function toUserIds({ values }: { values: unknown[] }): number[] {
  const ids = values.map((value) => Number(value));
  const invalid = values.filter((_, index) => !Number.isInteger(ids[index]) || ids[index] <= 0);
  if (invalid.length > 0) {
    throw new Error(`Beisen user IDs are positive whole numbers, but these are not: ${invalid.map(String).join(', ')}.`);
  }
  return ids;
}

const BATCH_SIZE = 300;
