import { t } from 'i18next';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

import { authMutations } from '../hooks/auth-hooks';
import { finishLoginHooks } from '../hooks/finish-login-hook';
import {
  LoginChallenge,
  loginChallengeUtils,
} from '../utils/login-challenge-utils';

import { BackLink, Heading } from './auth-landing/auth-drawer-parts';

const CODE_LENGTH = 6;

function MfaChallengeStep({
  challengeToken,
  onBack,
  onChallenge,
}: MfaChallengeStepProps) {
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const finishLogin = finishLoginHooks.useFinishLogin();

  const { mutate, isPending } = authMutations.useVerifyMfa({
    onSuccess: finishLogin,
    onError: (error) => {
      setCode('');
      const challenge = loginChallengeUtils.parse(error);
      if (challenge !== null) {
        onChallenge(challenge);
        return;
      }
      setErrorMessage(
        loginChallengeUtils.messageFor(error) ??
          t('The verification expired. Sign in again.'),
      );
    },
  });

  const submit = (value: string) => {
    setErrorMessage(null);
    mutate({ challengeToken, code: value.trim() });
  };

  const handleCodeChange = (value: string) => {
    setErrorMessage(null);
    setCode(value);
    if (value.length === CODE_LENGTH) {
      submit(value);
    }
  };

  const toggleMode = () => {
    setUseRecoveryCode((current) => !current);
    setCode('');
    setErrorMessage(null);
  };

  return (
    <>
      <BackLink onClick={onBack} />
      <Heading
        title={t('Two-step verification')}
        subtitle={
          useRecoveryCode
            ? t('Enter one of your recovery codes.')
            : t('Enter the 6-digit code from your authenticator app.')
        }
      />
      <div className="flex flex-col items-center gap-4">
        {useRecoveryCode ? (
          <form
            className="grid w-full gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (code.trim().length >= CODE_LENGTH) {
                submit(code);
              }
            }}
          >
            <Input
              autoFocus
              value={code}
              onChange={(event) => {
                setErrorMessage(null);
                setCode(event.target.value);
              }}
              placeholder={t('Recovery code')}
              autoComplete="one-time-code"
              className="h-11 rounded-lg text-center"
              data-testid="mfa-recovery-input"
            />
            <Button
              type="submit"
              loading={isPending}
              disabled={code.trim().length < CODE_LENGTH}
              className="h-11 rounded-lg"
              data-testid="mfa-recovery-submit"
            >
              {t('Verify')}
            </Button>
          </form>
        ) : (
          <InputOTP
            maxLength={CODE_LENGTH}
            value={code}
            onChange={handleCodeChange}
            disabled={isPending}
            autoFocus
            data-testid="mfa-code"
          >
            <InputOTPGroup>
              {Array.from({ length: CODE_LENGTH }).map((_, index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        )}
        {errorMessage && (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}
        <button
          type="button"
          onClick={toggleMode}
          data-testid="mfa-toggle-mode"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {useRecoveryCode
            ? t('Use the authenticator app instead')
            : t('Use a recovery code')}
        </button>
      </div>
    </>
  );
}

export { MfaChallengeStep };

type MfaChallengeStepProps = {
  challengeToken: string;
  onBack: () => void;
  onChallenge: (challenge: LoginChallenge) => void;
};
