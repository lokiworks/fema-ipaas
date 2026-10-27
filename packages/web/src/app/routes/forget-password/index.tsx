import { AuthSplitLayout, ResetPasswordForm } from '@/features/authentication';

const ResetPasswordPage = () => {
  return (
    <AuthSplitLayout showMobileBrand>
      <ResetPasswordForm />
    </AuthSplitLayout>
  );
};

export { ResetPasswordPage };
