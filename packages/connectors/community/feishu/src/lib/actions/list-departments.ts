import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuOutputSchemas } from '../output-schemas';
import { feishuContacts } from '../common/contacts';

export const listDepartments = createAction({
  auth: feishuAuth,
  name: 'list_departments',
  displayName: 'List Sub-Departments',
  description: 'List the departments below a department, to build the department mapping table',
  audience: 'both',
  outputSchema: feishuOutputSchemas.listDepartments,
  classification: 'SEARCH',
  aiMetadata: {
    description:
      'List the sub-departments of a Feishu/Lark department, optionally the whole tree below it, with their open_department_id (the od- ID that provisioning accepts), custom department ID, name and parent. Pick this to fill a department mapping table from HR department codes to Feishu departments, or to check that a mapped department still exists. It only reads, and only sees departments inside the app contact scope (department 0, the company root, needs the all-members scope).',
    idempotent: true,
  },
  reliability: { rateLimits: [{ bucket: 'contact-read', scope: 'APP_ENDPOINT', perSecond: 50 }] },
  props: {
    parentDepartmentId: Property.ShortText({
      displayName: 'Parent Department ID',
      description: 'A department ID or an open_department_id starting with od-. Use 0 for the company root.',
      required: true,
      defaultValue: '0',
    }),
    includeAllLevels: Property.Checkbox({
      displayName: 'Include All Levels',
      description: 'Return the whole tree below the parent instead of only the direct children.',
      required: false,
      defaultValue: true,
    }),
    maxItems: Property.Number({
      displayName: 'Maximum Departments',
      description: 'Stop after this many departments, up to 10000. Feishu serves 50 per call.',
      required: false,
      defaultValue: 1000,
    }),
  },
  async run(context) {
    const { parentDepartmentId, includeAllLevels, maxItems } = context.propsValue;
    const departments = await feishuContacts.listDepartments({
      auth: context.auth,
      rateLimit: context.rateLimit,
      input: {
        parentDepartmentId: parentDepartmentId.trim(),
        includeAllLevels: includeAllLevels !== false,
        maxItems: Math.min(Math.max(maxItems ?? DEFAULT_MAX_ITEMS, 1), MAX_ITEMS),
      },
    });
    return { departments, count: departments.length };
  },
});

const DEFAULT_MAX_ITEMS = 1000;

const MAX_ITEMS = 10000;
