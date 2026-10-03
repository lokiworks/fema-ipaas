import { FullLogo } from '@/components/custom/full-logo';
import { ResetPasswordForm } from '@/features/authentication';

const ResetPasswordPage = () => {
  return (
    <main className="mx-auto flex min-h-screen flex-col items-center justify-center gap-2 p-4">
      <FullLogo />
      <ResetPasswordForm />
    </main>
  );
};

export { ResetPasswordPage };
