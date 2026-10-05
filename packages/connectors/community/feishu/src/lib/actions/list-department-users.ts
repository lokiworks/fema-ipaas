import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuContacts } from '../common/contacts';

export const listDepartmentUsers = createAction({
  auth: feishuAuth,
  name: 'list_department_users',
  displayName: 'List Department Members',
  description: 'List the Feishu accounts in a department, for reconciling against the HR roster',
  audience: 'both',
  classification: 'SEARCH',
  aiMetadata: {
    description:
      'List every Feishu/Lark member who sits directly in a department, optionally including all sub-departments, with open_id, employee number, mobile, email, departments and whether the account is suspended or resigned. Pick this to reconcile Feishu against the HR roster, for example to find HR employees without an account or accounts without an HR employee. It follows the page token until the department is exhausted or the limit is hit, only reads, and only sees departments inside the app contact scope (the root department 0 needs the all-members scope). Mobile, email and employee number only come back when the app has the matching field permissions.',
    idempotent: true,
  },
  props: {
    departmentId: Property.ShortText({
      displayName: 'Department ID',
      description: 'The department ID shown in the Feishu admin console, an open_department_id starting with od-, or 0 for the whole company.',
      required: true,
    }),
    includeSubDepartments: Property.Checkbox({
      displayName: 'Include Sub-Departments',
      description: 'Also list the members of every department below this one.',
      required: false,
      defaultValue: true,
    }),
    maxItems: Property.Number({
      displayName: 'Maximum Members',
      description: 'Stop after this many members, up to 50000. Feishu serves 50 per call.',
      required: false,
      defaultValue: 1000,
    }),
  },
  async run(context) {
    const { departmentId, includeSubDepartments, maxItems } = context.propsValue;
    const members = await feishuContacts.listDepartmentUsers({
      auth: context.auth,
      input: {
        departmentId: departmentId.trim(),
        includeSubDepartments: includeSubDepartments !== false,
        maxItems: Math.min(Math.max(maxItems ?? DEFAULT_MAX_ITEMS, 1), MAX_ITEMS),
      },
    });
    return { members, count: members.length };
  },
});

const DEFAULT_MAX_ITEMS = 1000;

const MAX_ITEMS = 50000;
