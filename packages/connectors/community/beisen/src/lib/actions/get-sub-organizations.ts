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
      'List the child organization units beneath one Beisen organization, optionally the whole subtree below it, as a flat list. Pick this to mirror the company department tree into another system or to resolve a department OId from an employee record into a name. The organization is identified by its numeric OId; the company root OId is 900 followed by the tenant ID, for example 900100000. It reads only, returns an empty list when the organization has no children and fails with a parameter error when the OId does not exist.',
    idempotent: true,
  },
  props: {
    organizationId: Property.ShortText({
      displayName: 'Organization ID',
      description: 'The numeric OId of the parent organization unit. The company root is 900 followed by your Beisen tenant ID, for example 900100000.',
      required: true,
    }),
    includeAllLevels: Property.Checkbox({
      displayName: 'Include All Levels',
      description: 'Return the whole subtree instead of only direct children.',
      required: false,
      defaultValue: false,
    }),
    includeDisabled: Property.Checkbox({
      displayName: 'Include Disabled Units',
      description: 'Also return organization units that have been disabled.',
      required: false,
      defaultValue: false,
    }),
  },
  async run(context) {
    const { organizationId, includeAllLevels, includeDisabled } = context.propsValue;
    const oId = parseOrganizationId({ value: organizationId });
    const organizations = await beisenCommon.callBusinessApi<unknown[]>({
      auth: context.auth,
      method: HttpMethod.POST,
      path: includeAllLevels ? TREES_PATH : CHILDREN_PATH,
      body: includeAllLevels
        ? { oIds: [oId], isWithDisable: includeDisabled === true, isWithSelf: false }
        : { oId, isWithDisable: includeDisabled === true, isWithSelf: false },
    });
    return organizations ?? [];
  },
});

function parseOrganizationId({ value }: { value: string }): number {
  const oId = Number(value.trim());
  if (!Number.isInteger(oId) || oId < 0) {
    throw new Error(`The organization ID must be the numeric OId of a Beisen organization unit, but got "${value}".`);
  }
  return oId;
}

const CHILDREN_PATH = '/TenantBaseExternal/api/v5/Organization/GetSubOrganizations';

const TREES_PATH = '/TenantBaseExternal/api/v5/Organization/GetSubOrganizationTrees';
