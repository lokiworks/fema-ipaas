import { PublicTenantInfo } from '@fema-ipaas/shared';
import { useCallback } from 'react';

import { authMutations } from './auth-hooks';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hasSso(tenants: PublicTenantInfo[]): boolean {
  return tenants.some((tenant) => tenant.ssoProviders.length > 0);
}

function useDiscovery({ onDiscovered }: UseDiscoveryParams) {
  const { mutate, isPending } = authMutations.useDiscoverTenants();
  const discover = useCallback(
    ({ email, onFinished }: DiscoverParams) => {
      const normalized = normalizeEmail(email);
      mutate(
        { email: normalized },
        {
          onSuccess: (response) => {
            onDiscovered({ email: normalized, tenants: response.tenants });
            onFinished?.(hasSso(response.tenants));
          },
          onError: () => {
            onDiscovered({ email: normalized, tenants: [] });
            onFinished?.(false);
          },
        },
      );
    },
    [mutate, onDiscovered],
  );
  return { discover, isDiscovering: isPending };
}

export const discoveryHooks = {
  useDiscovery,
  normalizeEmail,
  hasSso,
};

export type DiscoveredTenants = {
  email: string;
  tenants: PublicTenantInfo[];
};

type UseDiscoveryParams = {
  onDiscovered: (discovered: DiscoveredTenants | null) => void;
};

type DiscoverParams = {
  email: string;
  onFinished?: (hasSso: boolean) => void;
};
