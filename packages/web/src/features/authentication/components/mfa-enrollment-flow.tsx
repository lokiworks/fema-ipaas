import {
  AuthenticationResponse,
  MfaEnrollConfirmResponse,
  MfaEnrollStartResponse,
} from '@fema-ipaas/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { useState } from 'react';

import { authenticationApi } from '@/api/authentication-api';
import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { HttpError } from '@/lib/api';

import { loginChallengeUtils } from '../utils/login-challenge-utils';

import { QrCode } from './qr-code';

const CODE_LENGTH = 6;

function MfaEnrollmentFlow({
  challengeToken,
  onCompleted,
}: MfaEnrollmentFlowProps) {
  const [setup, setSetup] = useState<MfaEnrollStartResponse | null>(null);
  const [confirmed, setConfirmed] = useState<MfaEnrollConfirmResponse | null>(
    null,
  );
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const start = useMutation<MfaEnrollStartResponse, HttpError, void>({
    mutationFn: () => authenticationApi.startMfaEnrollment({ challengeToken }),
    onSuccess: setSetup,
    onError: () =>
      setErrorMessage(
        t('Two-step verification could not be started. Try again.'),
      ),
  });

  const confirm = useMutation<MfaEnrollConfirmResponse, HttpError, string>({
    mutationFn: (value) =>
      authenticationApi.confirmMfaEnrollment({ challengeToken, code: value }),
    onSuccess: setConfirmed,
    onError: (error) => {
      setCode('');
      setErrorMessage(
        loginChallengeUtils.messageFor(error) ??
          t('The verification expired. Sign in again.'),
      );
    },
  });

  const handleCodeChange = (value: string) => {
    setErrorMessage(null);
    setCode(value);
    if (value.length === CODE_LENGTH) {
      confirm.mutate(value);
    }
  };

  if (confirmed !== null) {
    return (
      <div className="flex flex-col gap-4" data-testid="mfa-recovery-codes">
        <p className="text-sm text-muted-foreground">
          {t(
            'Two-step verification is on. Keep these recovery codes somewhere safe. Each one works once if you lose access to your authenticator app.',
          )}
        </p>
        <CopyToClipboardInput
          textToCopy={confirmed.recoveryCodes.join('\n')}
          useInput={false}
          fileName="recovery-codes.txt"
          rows={Math.min(confirmed.recoveryCodes.length, 10)}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="mfa-codes-saved"
            checked={saved}
            onCheckedChange={(value) => setSaved(value === true)}
            data-testid="mfa-codes-saved"
          />
          <Label htmlFor="mfa-codes-saved" className="text-sm">
            {t('I have saved my recovery codes')}
          </Label>
        </div>
        <Button
          disabled={!saved}
          onClick={() =>
            onCompleted({
              authentication: parseAuthentication(confirmed.authentication),
            })
          }
          data-testid="mfa-done"
        >
          {t('Done')}
        </Button>
      </div>
    );
  }

  if (setup === null) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'You will need an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.',
          )}
        </p>
        {errorMessage && (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}
        <Button
          loading={start.isPending}
          onClick={() => {
            setErrorMessage(null);
            start.mutate();
          }}
          data-testid="mfa-start"
        >
          {t('Start setup')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground">
        {t(
          'Scan this QR code with your authenticator app, then enter the 6-digit code it shows.',
        )}
      </p>
      <QrCode value={setup.otpauthUrl} label={t('Authenticator QR code')} />
      <div className="w-full">
        <Label className="mb-1.5 block text-xs text-muted-foreground">
          {t('Or enter this key manually')}
        </Label>
        <CopyToClipboardInput textToCopy={setup.secret} useInput />
      </div>
      <InputOTP
        maxLength={CODE_LENGTH}
        value={code}
        onChange={handleCodeChange}
        disabled={confirm.isPending}
        autoFocus
        data-testid="mfa-enroll-code"
      >
        <InputOTPGroup>
          {Array.from({ length: CODE_LENGTH }).map((_, index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {errorMessage && (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function parseAuthentication(value: unknown): AuthenticationResponse | null {
  const parsed = AuthenticationResponse.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export { MfaEnrollmentFlow };

type MfaEnrollmentFlowProps = {
  challengeToken?: string;
  onCompleted: (result: {
    authentication: AuthenticationResponse | null;
  }) => void;
};
