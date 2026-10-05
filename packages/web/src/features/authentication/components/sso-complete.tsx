import { ErrorCode, isNil } from '@fema-ipaas/core-utils';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { authenticationApi } from '@/api/authentication-api';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';
import { useRedirectAfterLogin } from '@/lib/navigation-utils';

function SsoComplete() {
  const [params] = useSearchParams();
  const ticket = params.get('ticket');
  const navigate = useNavigate();
  const redirectAfterLogin = useRedirectAfterLogin();
  const started = useRef(false);
  const { mutate, error, isError } = useMutation({
    mutationFn: (value: string) => authenticationApi.ssoExchange(value),
    onSuccess: (data) => {
      authenticationSession.saveResponse(data, false);
      if (isNil(data.projectId)) {
        navigate('/create-tenant');
        return;
      }
      redirectAfterLogin();
    },
  });

  useEffect(() => {
    if (started.current || isNil(ticket)) {
      return;
    }
    started.current = true;
    mutate(ticket);
  }, [ticket, mutate]);

  const failed = isNil(ticket) || isError;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      {failed ? (
        <>
          <p className="max-w-sm text-sm text-destructive" role="alert">
            {failureMessage({ error, missingTicket: isNil(ticket) })}
          </p>
          <Link
            to="/sign-in"
            className="text-sm font-medium underline underline-offset-4"
          >
            {t('Back to sign in')}
          </Link>
        </>
      ) : (
        <>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('Signing you in…')}
          </p>
        </>
      )}
    </div>
  );
}

function failureMessage({
  error,
  missingTicket,
}: {
  error: unknown;
  missingTicket: boolean;
}): string {
  if (missingTicket) {
    return t('The sign-in has expired. Start again.');
  }
  const code = api.isError(error)
    ? (error.response?.data as { code?: ErrorCode } | undefined)?.code
    : undefined;
  if (code === ErrorCode.USER_IS_INACTIVE) {
    return t('Your account has been disabled. Contact an administrator.');
  }
  return t('The sign-in has expired. Start again.');
}

export { SsoComplete };
