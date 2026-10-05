import { PageTitle } from '@/app/components/page-title';
import { SsoComplete, VerifyEmail } from '@/features/authentication';
import { AcceptInvitation } from '@/features/invitations';

import { ChangePasswordPage } from './change-password';
import { CreateTenantPage } from './create-tenant';
import { ResetPasswordPage } from './forget-password';
import { SetupPage } from './setup';
import { SignInPage } from './sign-in';
import { SignUpPage } from './sign-up';

export const authRoutes = [
  {
    path: '/forget-password',
    element: (
      <PageTitle title="Forget Password">
        <ResetPasswordPage />
      </PageTitle>
    ),
  },
  {
    path: '/reset-password',
    element: (
      <PageTitle title="Reset Password">
        <ChangePasswordPage />
      </PageTitle>
    ),
  },
  {
    path: '/sign-in',
    element: (
      <PageTitle title="Sign In">
        <SignInPage />
      </PageTitle>
    ),
  },
  {
    path: '/sso/complete',
    element: (
      <PageTitle title="Sign In">
        <SsoComplete />
      </PageTitle>
    ),
  },
  {
    path: '/verify-email',
    element: (
      <PageTitle title="Verify Email">
        <VerifyEmail />
      </PageTitle>
    ),
  },
  {
    path: '/setup',
    element: (
      <PageTitle title="Setup wizard">
        <SetupPage />
      </PageTitle>
    ),
  },
  {
    path: '/sign-up',
    element: (
      <PageTitle title="Sign Up">
        <SignUpPage />
      </PageTitle>
    ),
  },
  {
    path: '/create-tenant',
    element: (
      <PageTitle title="Create Tenant">
        <CreateTenantPage />
      </PageTitle>
    ),
  },
  {
    path: '/invitation',
    element: (
      <PageTitle title="Accept Invitation">
        <AcceptInvitation />
      </PageTitle>
    ),
  },
];
