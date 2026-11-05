import { useParams } from 'react-router-dom';

import { TenantAuthLanding } from '@/features/authentication';

const TenantSignInPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  return (
    <TenantAuthLanding
      key={slug}
      slug={slug ?? ''}
      initialMode="signin"
      fallbackToGenericWhenMissing={false}
    />
  );
};

TenantSignInPage.displayName = 'TenantSignInPage';

export { TenantSignInPage };
