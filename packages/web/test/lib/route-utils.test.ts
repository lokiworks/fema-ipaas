import { Permission } from '@fema-ipaas/core-utils';
import { describe, expect, it, vi } from 'vitest';

import { determineDefaultRoute } from '@/lib/route-utils';

vi.mock('@/lib/authentication-session', () => ({
  authenticationSession: {
    appendProjectRoutePrefix: (path: string) => path,
  },
}));

const allow =
  (permissions: Permission[]) =>
  (permission: Permission): boolean =>
    permissions.includes(permission);

describe('determineDefaultRoute', () => {
  it('routes based on the user permissions', () => {
    expect(
      determineDefaultRoute({ checkAccess: allow([Permission.READ_RUN]) }),
    ).toBe('/home');
    expect(
      determineDefaultRoute({ checkAccess: allow([Permission.READ_WORKFLOW]) }),
    ).toBe('/automations');
    expect(determineDefaultRoute({ checkAccess: () => false })).toBe('/home');
  });

  it('prefers home over workflows when the user can read runs', () => {
    expect(
      determineDefaultRoute({
        checkAccess: allow([Permission.READ_RUN, Permission.READ_WORKFLOW]),
      }),
    ).toBe('/home');
  });
});
