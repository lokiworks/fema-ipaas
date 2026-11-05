import { PublicTenantInfo } from '@fema-ipaas/shared';
import { createContext, useContext } from 'react';

const TenantLoginContext = createContext<PublicTenantInfo | null>(null);

function useLoginTenant(): PublicTenantInfo | null {
  return useContext(TenantLoginContext);
}

export { TenantLoginContext, useLoginTenant };
