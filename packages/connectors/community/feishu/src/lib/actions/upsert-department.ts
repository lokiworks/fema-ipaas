import { createAction, Property } from '@fema-ipaas/connector-sdk';
import { feishuAuth } from '../auth';
import { feishuDepartments } from '../common/departments';

export const upsertDepartment = createAction({
  auth: feishuAuth, name: 'upsert_department', displayName: 'Create or update department', description: 'Find by the custom department ID before creating or updating',
  audience: 'both', classification: 'WRITE', aiMetadata: { description: 'Converge a department by a stable custom ID. Looks up before creation and sends only changed fields. Safe to repeat.', idempotent: true },
  reliability: { writeSafety: 'LOOKUP_BEFORE_WRITE', lookupKeys: ['customDepartmentId'], readBack: { actionName: 'get_department', aspects: ['name', 'parent'] }, rateLimits: [{ bucket: 'contact-read', scope: 'APP_ENDPOINT', perSecond: 50 }, { bucket: 'contact-write', scope: 'APP_ENDPOINT', perSecond: 1 }] },
  outputSchema: { fields: [{ key: 'created' }, { key: 'open_department_id' }, { key: 'department_id' }, { key: 'changed' }] },
  props: {
    targetDepartmentId: Property.ShortText({ displayName: 'Existing department ID', description: 'Use the mapped open department ID when updating a department created outside this workflow.', required: false }),
    customDepartmentId: Property.ShortText({ displayName: 'Custom department ID', description: 'Use a stable source key, for example bs-12345.', required: true }),
    name: Property.ShortText({ displayName: 'Name', required: true }),
    parentDepartmentId: Property.ShortText({ displayName: 'Parent department ID', required: true, defaultValue: '0' }),
    leaderOpenId: Property.ShortText({ displayName: 'Leader open ID', required: false }),
    order: Property.Number({ displayName: 'Order', required: false }),
  },
  async run(context) { return feishuDepartments.upsert({ auth: context.auth, rateLimit: context.rateLimit, input: context.propsValue }); },
});
