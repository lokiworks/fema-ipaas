import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, tryCatch, type DropdownState } from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { beisenCommon, type BeisenAuthValue } from './index';

function rootOrganization() {
  return Property.Dropdown({
    displayName: 'Root organization OId',
    description: 'Pick the organization to search under, usually the company root. To type an OId instead, set the value type in the top-right corner of the field to String.',
    auth: beisenAuth,
    required: true,
    refreshers: [],
    options: async ({ auth }) => listOptions({ auth }),
  });
}

async function listOptions({ auth }: { auth: BeisenAuthValue | undefined }): Promise<DropdownState<string>> {
  if (!auth) {
    return { disabled: true, options: [], placeholder: 'Select a Beisen connection first' };
  }
  const { data, error } = await tryCatch(() => beisenCommon.callBusinessApi<Record<string, unknown>[]>({
    auth,
    method: HttpMethod.POST,
    path: ORGANIZATION_TREE_PATH,
    body: { oIds: [0], isWithDisable: false, isWithSelf: false, isWithDeleted: false },
  }));
  if (error) {
    return { disabled: true, options: [], placeholder: 'Could not list Beisen organizations, set the value type to String and type the OId' };
  }
  const options = organizationOptions({ records: data ?? [] });
  if (options.length === 0) {
    return { disabled: true, options: [], placeholder: 'Beisen returned no organization units' };
  }
  return { disabled: false, options };
}

function organizationOptions({ records }: { records: Record<string, unknown>[] }): { label: string; value: string }[] {
  const units = records.flatMap((record) => {
    const oId = record['oId'];
    const name = record['name'];
    const parent = record['pOIdOrgAdmin'];
    return typeof oId === 'number' ? [{ oId, name: typeof name === 'string' && name.length > 0 ? name : String(oId), parent: typeof parent === 'number' ? parent : null }] : [];
  });
  const known = new Set(units.map((unit) => unit.oId));
  const roots = units.filter((unit) => unit.parent === null || !known.has(unit.parent));
  const others = units.filter((unit) => unit.parent !== null && known.has(unit.parent));
  return [...roots, ...others].slice(0, MAX_OPTIONS).map((unit) => ({ label: `${unit.name} (${unit.oId})`, value: String(unit.oId) }));
}

export const beisenOrganizationProps = {
  rootOrganization,
  listOptions,
};

const ORGANIZATION_TREE_PATH = '/TenantBaseExternal/api/v5/Organization/GetSubOrganizationTrees';
const MAX_OPTIONS = 2000;
