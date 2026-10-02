import { t } from 'i18next';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { LoadingSpinner } from '@/components/custom/spinner';

import { userInvitationQueries } from '../hooks/user-invitations-hooks';

const REDIRECT_DELAY_MS = 3000;

const AcceptInvitation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get('token');
  const email = searchParams.get('email');
  const { data: registered, isError } =
    userInvitationQueries.useAcceptInvitation({ token: invitationToken });

  useEffect(() => {
    if (registered === undefined) {
      return;
    }
    const timer = setTimeout(
      () => {
        navigate(
          registered || !email
            ? '/sign-in'
            : `/sign-up?${new URLSearchParams({ email }).toString()}`,
        );
      },
      registered ? 0 : REDIRECT_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [registered, email, navigate]);

  if (!invitationToken || isError) {
    return (
      <div className="container mx-auto mt-10 max-w-md">
        <p className="mt-4 text-lg text-center text-destructive">
          {t('Invalid invitation token. Please try again.')}
        </p>
      </div>
    );
  }

  if (registered === undefined) {
    return (
      <div className="w-screen h-screen flex justify-center items-center">
        <LoadingSpinner isLarge={true}></LoadingSpinner>
      </div>
    );
  }

  return (
    <div className="container mx-auto mt-10 max-w-md">
      <p className="text-2xl font-bold text-center">
        {t('Team Invitation Accepted')}
      </p>
      <p className="mt-4 text-lg text-center text-gray-700">
        {t(
          'Thank you for accepting the invitation. We are redirecting you right now...',
        )}
      </p>
    </div>
  );
};
AcceptInvitation.displayName = 'AcceptInvitation';
export { AcceptInvitation };
