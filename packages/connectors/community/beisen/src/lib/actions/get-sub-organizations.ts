import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { beisenCommon } from '../common';

export const getSubOrganizations = createAction({
  auth: beisenAuth,
  name: 'get_sub_organizations',
  displayName: 'Get Sub Organizations',
  description: 'List the organization units under a given Beisen organization',
  audience: 'both',
  classification: 'READ',
  aiMetadata: {
    description:
      'List the child organization units beneath one Beisen organization, optionally walking the whole subtree. Pick this to mirror the company department tree into another system or to resolve a department name for an employee record. It reads only and returns an empty list when the organization has no children.',
    idempotent: true,
  },
  props: {
    organizationId: Property.ShortText({
      displayName: 'Organization ID',
      description: 'The parent organization unit ID. Use the company root to start from the top.',
      required: true,
    }),
    includeAllLevels: Property.Checkbox({
      displayName: 'Include All Levels',
      description: 'Return the whole subtree instead of only direct children.',
      required: false,
      defaultValue: false,
    }),
  },
  async run(context) {
    const { organizationId, includeAllLevels } = context.propsValue;
    return beisenCommon.callBusinessApi<unknown>({
      auth: context.auth,
      method: HttpMethod.POST,
      path: '/TenantBaseExternal/api/v5/Organization/GetSubOrganizations',
      body: {
        organizationId,
        isIncludeSubOrganization: includeAllLevels ?? false,
      },
    });
  },
});
