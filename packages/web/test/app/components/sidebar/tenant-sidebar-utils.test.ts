import { describe, expect, it } from 'vitest';

import { tenantSidebarUtils } from '@/app/components/sidebar/tenant';

const PATHS = [
  '/tenant/connectors',
  '/tenant/connectors/requests',
  '/tenant/connectors/development',
  '/tenant/setup/connectors',
];

describe('tenantSidebarUtils.findActiveTo', () => {
  it('picks the longest matching prefix', () => {
    expect(
      tenantSidebarUtils.findActiveTo({
        pathname: '/tenant/connectors/requests',
        paths: PATHS,
      }),
    ).toBe('/tenant/connectors/requests');
  });

  it('keeps the parent active for detail pages', () => {
    expect(
      tenantSidebarUtils.findActiveTo({
        pathname: '/tenant/connectors/detail/feishu',
        paths: PATHS,
      }),
    ).toBe('/tenant/connectors');
  });

  it('does not match a sibling that only shares a prefix', () => {
    expect(
      tenantSidebarUtils.findActiveTo({
        pathname: '/tenant/connectors-extra',
        paths: PATHS,
      }),
    ).toBeNull();
  });
});
