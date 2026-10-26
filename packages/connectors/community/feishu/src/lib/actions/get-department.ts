import { createAction, Property } from '@fema-ipaas/connector-sdk';
import { feishuAuth } from '../auth';
import { feishuDepartments } from '../common/departments';

export const getDepartment = createAction({
  auth: feishuAuth, name: 'get_department', displayName: 'Get department', description: 'Read one department by its ID',
  audience: 'both', classification: 'READ', aiMetadata: { description: 'Read a department and its parent, leader and order.', idempotent: true },
  reliability: { rateLimits: [{ bucket: 'contact-read', scope: 'APP_ENDPOINT', perSecond: 50 }] }, outputSchema: { fields: [{ key: 'open_department_id' }, { key: 'department_id' }, { key: 'name' }, { key: 'parent_department_id' }] },
  props: { departmentId: Property.ShortText({ displayName: 'Department ID', required: true }) },
  async run(context) { return feishuDepartments.get({ auth: context.auth, rateLimit: context.rateLimit, departmentId: context.propsValue.departmentId }); },
});
