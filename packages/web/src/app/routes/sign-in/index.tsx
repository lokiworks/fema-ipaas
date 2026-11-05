import { useState } from 'react';

import { AuthLanding, TenantAuthLanding } from '@/features/authentication';
import { tenantContext } from '@/lib/tenant-context';

const SignInPage: React.FC = () => {
  const [rememberedTenant] = useState(() => tenantContext.get());
  if (rememberedTenant !== null) {
    return (
      <TenantAuthLanding
        slug={rememberedTenant}
        initialMode="signin"
        fallbackToGenericWhenMissing
      />
    );
  }
  return <AuthLanding initialMode="signin" />;
};

SignInPage.displayName = 'SignInPage';

export { SignInPage };
