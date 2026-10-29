import { t } from 'i18next';
import { LinkIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { LoadingSpinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AuthSplitLayout } from '@/features/authentication';

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
      <AuthSplitLayout showMobileBrand>
        <InvalidInvitationCard />
      </AuthSplitLayout>
    );
  }

  if (registered === undefined) {
    return (
      <AuthSplitLayout showMobileBrand>
        <LoadingSpinner isLarge={true}></LoadingSpinner>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout showMobileBrand>
      <Card className="w-full max-w-md rounded-sm drop-shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">
            {t('Team Invitation Accepted')}
          </CardTitle>
          <CardDescription>
            {t(
              'Thank you for accepting the invitation. We are redirecting you right now...',
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    </AuthSplitLayout>
  );
};
AcceptInvitation.displayName = 'AcceptInvitation';

function InvalidInvitationCard() {
  return (
    <Card
      className="w-full max-w-md rounded-sm drop-shadow-xl"
      data-testid="invitation-invalid"
    >
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-muted">
          <LinkIcon className="size-5 text-muted-foreground" />
        </div>
        <CardTitle className="text-2xl">
          {t('This invitation link no longer works')}
        </CardTitle>
        <CardDescription>
          {t(
            'The link has expired, was already used, or the invitation was revoked. Ask the administrator who invited you to send a new invitation.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t(
            'If you already joined, sign in with the email address the invitation was sent to.',
          )}
        </p>
        <Button asChild className="w-full">
          <Link to="/sign-in">{t('Go to sign in')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export { AcceptInvitation };
