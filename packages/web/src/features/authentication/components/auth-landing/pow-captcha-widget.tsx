import { CaptchaChallenge } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleCheck, Loader2, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { authenticationApi } from '@/api/authentication-api';

import { captchaUtils } from '../../utils/captcha-utils';

const REFRESH_AFTER_MS = 4 * 60 * 1000;

function PowCaptchaWidget({
  onToken,
  onUnavailable,
  resetSignal,
}: PowCaptchaWidgetProps) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<PowStatus>('working');

  useEffect(() => {
    let cancelled = false;
    onToken(undefined);
    setStatus('working');
    authenticationApi
      .captchaChallenge()
      .then((challenge: CaptchaChallenge) =>
        captchaUtils.solveInWorker(challenge),
      )
      .then((token) => {
        if (cancelled) {
          return;
        }
        setStatus('ready');
        onToken(token);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setStatus('failed');
        onUnavailable();
      });
    const refresh = setTimeout(
      () => setAttempt((count) => count + 1),
      REFRESH_AFTER_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(refresh);
    };
  }, [attempt, resetSignal, onToken, onUnavailable]);

  return (
    <div
      className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
      role="status"
      data-testid="pow-captcha"
      data-status={status}
    >
      {status === 'working' && (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          {t('Checking that you are human')}
        </>
      )}
      {status === 'ready' && (
        <>
          <CircleCheck className="size-3.5 text-primary" />
          {t('Verified')}
        </>
      )}
      {status === 'failed' && (
        <>
          <ShieldAlert className="size-3.5 text-destructive" />
          <span>{t('The human check could not run.')}</span>
          <button
            type="button"
            onClick={() => setAttempt((count) => count + 1)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {t('Try again')}
          </button>
        </>
      )}
    </div>
  );
}

export { PowCaptchaWidget };

type PowStatus = 'working' | 'ready' | 'failed';

type PowCaptchaWidgetProps = {
  onToken: (token: string | undefined) => void;
  onUnavailable: () => void;
  resetSignal: number;
};
