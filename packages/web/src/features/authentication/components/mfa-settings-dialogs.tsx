import { t } from 'i18next';
import { useState } from 'react';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { accountSecurityHooks } from '../hooks/account-security-hooks';
import { loginChallengeUtils } from '../utils/login-challenge-utils';

import { MfaEnrollmentFlow } from './mfa-enrollment-flow';

function MfaEnableDialog({ open, onOpenChange }: MfaDialogProps) {
  const refresh = accountSecurityHooks.useRefreshSecurityStatus();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Turn on two-step verification')}</DialogTitle>
          <DialogDescription>
            {t('Protect your account with a code from an authenticator app.')}
          </DialogDescription>
        </DialogHeader>
        <MfaEnrollmentFlow
          key={open ? 'open' : 'closed'}
          onCompleted={() => {
            refresh();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function MfaDisableDialog({ open, onOpenChange }: MfaDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Turn off two-step verification')}</DialogTitle>
          <DialogDescription>
            {t(
              'Enter a code from your authenticator app, or a recovery code, to confirm.',
            )}
          </DialogDescription>
        </DialogHeader>
        <MfaDisableForm
          key={open ? 'open' : 'closed'}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function MfaDisableForm({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const disable = accountSecurityHooks.useDisableMfa();

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setErrorMessage(null);
        disable.mutate(
          { code: code.trim() },
          {
            onSuccess: onDone,
            onError: (error) =>
              setErrorMessage(
                loginChallengeUtils.messageFor(error) ??
                  t('Something went wrong, please try again later'),
              ),
          },
        );
      }}
    >
      <Input
        autoFocus
        value={code}
        onChange={(event) => {
          setErrorMessage(null);
          setCode(event.target.value);
        }}
        placeholder={t('Verification code')}
        autoComplete="one-time-code"
        data-testid="mfa-disable-code"
      />
      {errorMessage && (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
      <Button
        type="submit"
        variant="destructive"
        loading={disable.isPending}
        disabled={code.trim().length < 6}
        data-testid="mfa-disable-submit"
      >
        {t('Turn off')}
      </Button>
    </form>
  );
}

function RecoveryCodesDialog({ open, onOpenChange }: MfaDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Recovery codes')}</DialogTitle>
          <DialogDescription>
            {t(
              'Generating new recovery codes makes all earlier codes stop working.',
            )}
          </DialogDescription>
        </DialogHeader>
        <RecoveryCodesBody
          key={open ? 'open' : 'closed'}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RecoveryCodesBody({ onDone }: { onDone: () => void }) {
  const regenerate = accountSecurityHooks.useRegenerateRecoveryCodes();
  const codes = regenerate.data?.recoveryCodes ?? null;

  if (codes === null) {
    return (
      <div className="grid gap-3">
        {regenerate.isError && (
          <p className="text-sm text-destructive" role="alert">
            {t('Something went wrong, please try again later')}
          </p>
        )}
        <Button
          loading={regenerate.isPending}
          onClick={() => regenerate.mutate()}
          data-testid="recovery-codes-generate"
        >
          {t('Generate new codes')}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3" data-testid="recovery-codes-list">
      <CopyToClipboardInput
        textToCopy={codes.join('\n')}
        useInput={false}
        fileName="recovery-codes.txt"
        rows={Math.min(codes.length, 10)}
      />
      <Button onClick={onDone}>{t('Done')}</Button>
    </div>
  );
}

export { MfaDisableDialog, MfaEnableDialog, RecoveryCodesDialog };

type MfaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
