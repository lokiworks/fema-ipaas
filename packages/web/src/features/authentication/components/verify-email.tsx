import { FlagId, TelemetryEventName } from '@fema-ipaas/shared';
import { HttpStatusCode } from 'axios';
import { t } from 'i18next';
import { MailCheck, MailWarning, MailX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { FullLogo } from '@/components/custom/full-logo';
import { LoadingSpinner } from '@/components/custom/spinner';
import { useTelemetry } from '@/components/providers/telemetry-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { flagsHooks } from '@/hooks/flags-hooks';
import { api } from '@/lib/api';

import { authMutations } from '../hooks/auth-hooks';

const VerifyEmail = () => {
  const [status, setStatus] = useState<VerifyStatus>('verifying');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const otp = searchParams.get('otpcode');
  const identityId = searchParams.get('identityId');
  const hasMutated = useRef(false);
  const { capture } = useTelemetry();
  const { data: smtpFlag } = flagsHooks.useFlag<boolean>(
    FlagId.SMTP_CONFIGURED,
  );
  const smtpConfigured = smtpFlag === true;

  const { mutate } = authMutations.useVerifyEmail({
    onSuccess: () => {
      capture({
        name: TelemetryEventName.EMAIL_VERIFICATION_COMPLETED,
        payload: {},
      });
      setStatus('verified');
      setTimeout(() => navigate('/sign-in'), REDIRECT_DELAY_MS);
    },
    onError: (error) => {
      setStatus(statusOfError(error));
    },
  });

  useEffect(() => {
    if (otp && identityId && !hasMutated.current) {
      mutate({ otp, identityId });
      hasMutated.current = true;
    }
  }, [otp, identityId, mutate]);

  if (!otp || !identityId) {
    return <Navigate to="/sign-in" replace />;
  }
  return (
    <div className="mx-auto flex h-screen w-screen flex-col items-center justify-center gap-2 px-4">
      <FullLogo />
      <Card className="w-full max-w-md rounded-sm p-6 drop-shadow-xl">
        <VerifyEmailStatus status={status} smtpConfigured={smtpConfigured} />
      </Card>
    </div>
  );
};
VerifyEmail.displayName = 'VerifyEmail';

function VerifyEmailStatus({
  status,
  smtpConfigured,
}: {
  status: VerifyStatus;
  smtpConfigured: boolean;
}) {
  switch (status) {
    case 'verifying':
      return (
        <div className="flex items-center gap-3" data-testid="verify-email">
          <LoadingSpinner className="size-6" />
          <span className="text-sm">{t('Verifying email...')}</span>
        </div>
      );
    case 'verified':
      return (
        <StatusBody
          icon={<MailCheck className="size-10 text-success" />}
          title={t('verifyEmailVerifiedTitle')}
          description={t('verifyEmailVerifiedDescription')}
        />
      );
    case 'invalid':
      return (
        <StatusBody
          icon={<MailX className="size-10 text-destructive" />}
          title={t('verifyEmailInvalidTitle')}
          description={
            smtpConfigured
              ? t('verifyEmailInvalidResendDescription')
              : t('verifyEmailInvalidContactAdminDescription')
          }
        />
      );
    case 'failed':
      return (
        <StatusBody
          icon={<MailWarning className="size-10 text-warning" />}
          title={t('verifyEmailFailedTitle')}
          description={t('verifyEmailFailedDescription')}
        />
      );
  }
}

function StatusBody({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3" data-testid="verify-email">
      {icon}
      <h1 className="text-lg font-medium">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button asChild>
        <Link to="/sign-in">{t('Back to sign in')}</Link>
      </Button>
    </div>
  );
}

function statusOfError(error: unknown): VerifyStatus {
  if (!api.isError(error)) {
    return 'failed';
  }
  const httpStatus = error.response?.status;
  if (
    httpStatus === HttpStatusCode.Gone ||
    httpStatus === HttpStatusCode.BadRequest ||
    httpStatus === HttpStatusCode.NotFound
  ) {
    return 'invalid';
  }
  return 'failed';
}

const REDIRECT_DELAY_MS = 5000;

type VerifyStatus = 'verifying' | 'verified' | 'invalid' | 'failed';

export { VerifyEmail };
