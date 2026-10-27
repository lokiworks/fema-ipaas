import { AuthSplitLayout, ChangePasswordForm } from '@/features/authentication';

const ChangePasswordPage = () => {
  return (
    <AuthSplitLayout showMobileBrand>
      <ChangePasswordForm />
    </AuthSplitLayout>
  );
};

export { ChangePasswordPage };
