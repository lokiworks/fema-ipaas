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
      'Read the employment records — department, job, position, employment status — for a list of Beisen user IDs. Pick this after Search Changed Employees when you hold user IDs and need the job details behind them. Beisen limits how many IDs one call accepts, so batch large lists; it never modifies Beisen data.',
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
    const { userIds } = context.propsValue;
    return beisenCommon.callBusinessApi<unknown>({
      auth: context.auth,
      method: HttpMethod.POST,
      path: '/TenantBaseExternal/api/v5/Employee/GetServiceInfoByIds',
      body: { userIds },
    });
  },
});
