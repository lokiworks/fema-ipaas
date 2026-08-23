import { AuthLanding } from '@/features/authentication';

const CreateTenantPage = () => {
  return <AuthLanding initialMode="signin" />;
};

CreateTenantPage.displayName = 'CreateTenantPage';

export { CreateTenantPage };
