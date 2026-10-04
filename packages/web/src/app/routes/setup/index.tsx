import { AuthLanding } from '@/features/authentication';

const SetupPage: React.FC = () => {
  return <AuthLanding initialMode="signup" />;
};

SetupPage.displayName = 'SetupPage';

export { SetupPage };
