import { createAction, Property } from '@fema-ipaas/connector-sdk';
import { feishuAuth } from '../auth';
import { feishuUserEnumeration } from '../common/user-enumeration';

export const enumerateUsers = createAction({
  auth: feishuAuth, name: 'enumerate_users', displayName: 'Enumerate employee accounts', description: 'Read the accounts in a department tree once per account',
  audience: 'both', classification: 'SEARCH', aiMetadata: { description: 'Enumerate accounts recursively across departments. A user with several departments is emitted only from its canonical department. Continue paging until nextPageToken is null.', idempotent: true },
  reliability: { enumeration: { entity: 'ACCOUNT', businessKeyPath: 'open_id' }, rateLimits: [{ bucket: 'contact-read', scope: 'APP_ENDPOINT', perSecond: 50 }] },
  props: { rootDepartmentId: Property.ShortText({ displayName: 'Root department ID', required: true, defaultValue: '0' }), pageToken: Property.ShortText({ displayName: 'Page token', required: false }), pageSize: Property.Number({ displayName: 'Page size', required: true, defaultValue: 50 }) },
  outputSchema: { fields: [{ key: 'items', listItems: [{ key: 'open_id' }, { key: 'employee_no' }, { key: 'name' }, { key: 'email' }, { key: 'mobile' }, { key: 'job_title' }, { key: 'department_ids' }, { key: 'is_frozen' }, { key: 'is_resigned' }] }, { key: 'nextPageToken' }] },
  async run(context) { return feishuUserEnumeration.page({ ...context.propsValue, auth: context.auth, rateLimit: context.rateLimit }); },
});
