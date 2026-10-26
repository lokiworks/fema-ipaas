import { createAction, Property } from '@fema-ipaas/connector-sdk';
import { feishuAuth } from '../auth';
import { feishuDepartments } from '../common/departments';

export const archiveDepartment = createAction({
  auth: feishuAuth, name: 'archive_department', displayName: 'Archive department', description: 'Move a department below the archive department',
  audience: 'both', classification: 'WRITE', aiMetadata: { description: 'Move a department to an archive parent without deleting it. Safe to repeat.', idempotent: true },
  reliability: { writeSafety: 'IDEMPOTENT', readBack: { actionName: 'get_department', aspects: ['parent'] }, rateLimits: [{ bucket: 'contact-read', scope: 'APP_ENDPOINT', perSecond: 50 }, { bucket: 'contact-write', scope: 'APP_ENDPOINT', perSecond: 1 }] }, outputSchema: { fields: [{ key: 'open_department_id' }, { key: 'department_id' }, { key: 'name' }, { key: 'parent_department_id' }] },
  props: { departmentId: Property.ShortText({ displayName: 'Department ID', required: true }), archiveParentId: Property.ShortText({ displayName: 'Archive department ID', required: true }) },
  async run(context) { return feishuDepartments.archive({ ...context.propsValue, auth: context.auth, rateLimit: context.rateLimit }); },
});
