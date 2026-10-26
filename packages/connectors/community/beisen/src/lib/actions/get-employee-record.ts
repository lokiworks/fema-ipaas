import { createAction, Property } from '@fema-ipaas/connector-sdk';
import { beisenAuth } from '../auth';
import { beisenEmployeeDirectory } from '../common/employee-directory';
import { beisenOutputSchemas } from '../output-schemas';

export const getEmployeeRecord = createAction({
  auth: beisenAuth, name: 'get_employee_record', displayName: 'Get current employee record',
  description: 'Find the current employee record by employee number, scanning the organization when no direct lookup is available',
  audience: 'both', classification: 'READ', aiMetadata: { description: 'Read the current effective main employment record by employee number. Scans up to 50000 records and rejects duplicate employee numbers. Returns null only after a complete scan.', idempotent: true },
  reliability: { rateLimits: [{ bucket: 'beisen-api', scope: 'TENANT', perSecond: 50 }] },
  props: { rootOrganizationId: Property.ShortText({ displayName: 'Root organization OId', required: true }), employeeNo: Property.ShortText({ displayName: 'Employee number', required: true }) },
  outputSchema: beisenOutputSchemas.employeeRecord,
  async run(context) { return beisenEmployeeDirectory.find({ ...context.propsValue, auth: context.auth, rateLimit: context.rateLimit }); },
});
