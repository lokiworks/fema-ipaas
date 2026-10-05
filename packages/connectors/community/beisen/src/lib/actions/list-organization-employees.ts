import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { STATUS_SCOPE_OPTIONS, StatusScope, beisenTimeWindow } from '../common/time-window';

export const listOrganizationEmployees = createAction({
  auth: beisenAuth,
  name: 'list_organization_employees',
  displayName: 'List Employees Of An Organization',
  description: 'List every employee under a Beisen organization, for reconciling against the target system',
  audience: 'both',
  classification: 'SEARCH',
  aiMetadata: {
    description:
      'List all Beisen employees of one organization unit (optionally with every unit below it) with their employee info and main-post employment record, by following the scroll cursor to the end. Pick this to reconcile Beisen against another system, for example to find employees without a Feishu account. The status scope decides who counts: active, departed, upcoming or all. Use the company root OId (900 followed by the tenant ID) to read everyone. It reads only, and stops at the maximum you set, up to 50000 people.',
    idempotent: true,
  },
  props: {
    organizationId: Property.ShortText({
      displayName: 'Organization ID',
      description: 'The numeric OId of the organization unit. The company root is 900 followed by your Beisen tenant ID, for example 900100000.',
      required: true,
    }),
    includeSubOrganizations: Property.Checkbox({
      displayName: 'Include Sub-Organizations',
      description: 'Also list the employees of every organization unit below this one.',
      required: false,
      defaultValue: true,
    }),
    statusScope: Property.StaticDropdown({
      displayName: 'Employee Status',
      description: 'Which employees to return. Departed employees are only returned when this is Departed or Every status.',
      required: true,
      defaultValue: 'ACTIVE',
      options: { options: STATUS_SCOPE_OPTIONS },
    }),
    maxItems: Property.Number({
      displayName: 'Maximum Employees',
      description: 'Stop after this many employees, up to 50000. Beisen serves 300 per call.',
      required: false,
      defaultValue: 5000,
    }),
  },
  async run(context) {
    const { organizationId, includeSubOrganizations, statusScope, maxItems } = context.propsValue;
    const orgOId = Number(organizationId.trim());
    if (!Number.isInteger(orgOId) || orgOId <= 0) {
      throw new Error(`The organization ID must be the numeric OId of a Beisen organization unit, but got "${organizationId}".`);
    }
    const preset = beisenTimeWindow.scopePreset({ scope: toScope(statusScope) });
    const employees = await beisenTimeWindow.scrollAll({
      auth: context.auth,
      path: ORGANIZATION_EMPLOYEES_PATH,
      body: {
        orgOId,
        includeSubOrg: includeSubOrganizations !== false,
        serviceType: [MAIN_SERVICE_TYPE],
        ...omitApprovalStatuses({ preset }),
      },
      maxItems: Math.min(Math.max(maxItems ?? DEFAULT_MAX_ITEMS, 1), MAX_ITEMS),
    });
    return { employees, count: employees.length };
  },
});

function omitApprovalStatuses({ preset }: { preset: Record<string, unknown> }): Record<string, unknown> {
  return Object.fromEntries(Object.entries(preset).filter(([key]) => key !== 'approvalStatuses'));
}

function toScope(value: unknown): StatusScope {
  return value === 'LEFT' || value === 'ONBOARDING' || value === 'ALL' ? value : 'ACTIVE';
}

const ORGANIZATION_EMPLOYEES_PATH = '/TenantBaseExternal/api/v5/Employee/GetEmployeeOfOrganization';

const MAIN_SERVICE_TYPE = 0;

const DEFAULT_MAX_ITEMS = 5000;

const MAX_ITEMS = 50000;
