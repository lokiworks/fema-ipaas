import { AccountSecurityStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { accountSecurityHooks } from '../hooks/account-security-hooks';

import {
  MfaDisableDialog,
  MfaEnableDialog,
  RecoveryCodesDialog,
} from './mfa-settings-dialogs';
import { PhoneBindingDialog } from './phone-binding-dialog';

function AccountSecurityCard() {
  const { data: status } = accountSecurityHooks.useSecurityStatus();
  const [dialog, setDialog] = useState<SecurityDialog | null>(null);

  if (!status) {
    return null;
  }

  const closeDialog = (open: boolean) => {
    if (!open) {
      setDialog(null);
    }
  };

  return (
    <Card data-testid="account-security-card">
      <CardHeader>
        <CardTitle>{t('Security')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <SecurityRow
          label={t('Email')}
          value={status.email ?? t('Not linked')}
          badge={
            status.email === null
              ? null
              : status.emailVerified
              ? t('Verified')
              : t('Not verified')
          }
        />
        <SecurityRow
          label={t('Phone number')}
          value={status.phone ?? t('Not linked')}
          badge={
            status.phone === null
              ? null
              : status.phoneVerified
              ? t('Verified')
              : t('Not verified')
          }
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog('phone')}
              data-testid="security-phone-action"
            >
              {status.phone === null ? t('Link') : t('Change')}
            </Button>
          }
        />
        <MfaRow status={status} onOpen={setDialog} />
        <ExternalLoginsRow status={status} />
      </CardContent>
      <PhoneBindingDialog
        open={dialog === 'phone'}
        onOpenChange={closeDialog}
      />
      <MfaEnableDialog
        open={dialog === 'mfa-enable'}
        onOpenChange={closeDialog}
      />
      <MfaDisableDialog
        open={dialog === 'mfa-disable'}
        onOpenChange={closeDialog}
      />
      <RecoveryCodesDialog
        open={dialog === 'recovery-codes'}
        onOpenChange={closeDialog}
      />
    </Card>
  );
}

function MfaRow({
  status,
  onOpen,
}: {
  status: AccountSecurityStatus;
  onOpen: (dialog: SecurityDialog) => void;
}) {
  if (!status.mfaEnabled) {
    return (
      <SecurityRow
        label={t('Two-step verification')}
        value={
          status.mfaRequiredByTenant
            ? t('Required by your organization')
            : t('Off')
        }
        action={
          <Button
            size="sm"
            onClick={() => onOpen('mfa-enable')}
            data-testid="security-mfa-enable"
          >
            {t('Turn on')}
          </Button>
        }
      />
    );
  }
  return (
    <SecurityRow
      label={t('Two-step verification')}
      value={t('recoveryCodesRemainingCount', {
        count: status.recoveryCodesRemaining,
      })}
      badge={t('On')}
      action={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpen('recovery-codes')}
            data-testid="security-mfa-recovery"
          >
            {t('New recovery codes')}
          </Button>
          {!status.mfaRequiredByTenant && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpen('mfa-disable')}
              data-testid="security-mfa-disable"
            >
              {t('Turn off')}
            </Button>
          )}
        </div>
      }
    />
  );
}

function ExternalLoginsRow({ status }: { status: AccountSecurityStatus }) {
  return (
    <SecurityRow
      label={t('Linked sign-ins')}
      value={
        status.externalLogins.length === 0
          ? t('None')
          : status.externalLogins.map((login) => login.label).join(' · ')
      }
    />
  );
}

function SecurityRow({
  label,
  value,
  badge,
  action,
}: {
  label: string;
  value: string;
  badge?: string | null;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate">{value}</span>
          {badge && <Badge variant="secondary">{badge}</Badge>}
        </span>
      </div>
      {action}
    </div>
  );
}

export { AccountSecurityCard };

type SecurityDialog = 'phone' | 'mfa-enable' | 'mfa-disable' | 'recovery-codes';
