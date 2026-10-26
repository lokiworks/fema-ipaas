import { createAction, Property } from '@fema-ipaas/connector-sdk';
import { beisenAuth } from '../auth';
import { beisenCommon } from '../common';
import { beisenEmployeeDirectory } from '../common/employee-directory';
import { beisenOutputSchemas } from '../output-schemas';

export const enumerateEmployees = createAction({
  auth: beisenAuth, name: 'enumerate_employees', displayName: 'Enumerate employees', description: 'Read current employees and recent departures one page at a time',
  classification: 'SEARCH', audience: 'both', aiMetadata: { description: 'Enumerate current employee records under a root organization. Scroll tokens expire after nine seconds to prevent an expired upstream cursor from being mistaken for a complete list.', idempotent: true },
  reliability: { enumeration: { entity: 'EMPLOYEE', businessKeyPath: 'recordInfo.jobNumber' }, rateLimits: [{ bucket: 'beisen-api', scope: 'TENANT', perSecond: 50 }] },
  props: {
    rootOrganizationId: Property.ShortText({ displayName: 'Root organization OId', required: true }),
    recentDeparturesDays: Property.Number({ displayName: 'Include departures from the last days', required: false, defaultValue: 30 }),
    pageToken: Property.ShortText({ displayName: 'Page token', required: false }), pageSize: Property.Number({ displayName: 'Page size', required: true, defaultValue: 300 }),
  },
  outputSchema: { fields: [{ key: 'items', listItems: beisenOutputSchemas.employeeRecord.fields }, { key: 'nextPageToken' }] },
  async run(context) {
    const result = await beisenEmployeeDirectory.page({ ...context.propsValue, auth: context.auth, rateLimit: context.rateLimit });
    const since = Date.now() - (context.propsValue.recentDeparturesDays ?? 30) * 86_400_000;
    return { ...result, items: result.items.filter((record) => {
      const status = String(beisenCommon.readPath({ record, path: 'recordInfo.employeeStatus' }));
      if (['2', '3', '7'].includes(status)) return true;
      if (status !== '8') return false;
      const lastWorkDate = beisenCommon.readPath({ record, path: 'recordInfo.lastWorkDate' });
      return typeof lastWorkDate === 'string' && new Date(lastWorkDate).getTime() >= since;
    }) };
  },
});
