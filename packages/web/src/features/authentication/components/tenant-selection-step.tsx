import { TenantMembershipOption, TenantStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { authMutations } from '../hooks/auth-hooks';
import { finishLoginHooks } from '../hooks/finish-login-hook';
import { tenantLoginHooks } from '../hooks/tenant-login-hooks';
import {
  LoginChallenge,
  loginChallengeUtils,
} from '../utils/login-challenge-utils';

import { BackLink, Heading } from './auth-landing/auth-drawer-parts';

function TenantSelectionStep({
  selectionToken,
  onBack,
  onChallenge,
}: TenantSelectionStepProps) {
  const {
    data: tenants,
    isLoading,
    isError,
  } = tenantLoginHooks.useTenantSelectionOptions(selectionToken);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const finishLogin = finishLoginHooks.useFinishLogin();

  const { mutate } = authMutations.useSelectTenant({
    onSuccess: finishLogin,
    onError: (error) => {
      setPendingTenantId(null);
      const challenge = loginChallengeUtils.parse(error);
      if (challenge !== null) {
        onChallenge(challenge);
        return;
      }
      setErrorMessage(
        loginChallengeUtils.messageFor(error) ??
          t('The selection expired. Sign in again.'),
      );
    },
  });

  const choose = (option: TenantMembershipOption) => {
    setErrorMessage(null);
    setPendingTenantId(option.tenantId);
    mutate({ selectionToken, tenantId: option.tenantId });
  };

  return (
    <>
      <BackLink onClick={onBack} />
      <Heading
        title={t('Choose an organization')}
        subtitle={t('Your account belongs to more than one organization.')}
      />
      {isLoading && (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {isError && (
        <p className="text-center text-sm text-destructive" role="alert">
          {t('The selection expired. Sign in again.')}
        </p>
      )}
      <ul className="grid gap-2" data-testid="tenant-selection-list">
        {(tenants ?? []).map((option) => (
          <li key={option.tenantId}>
            <TenantOptionButton
              option={option}
              pending={pendingTenantId === option.tenantId}
              disabled={pendingTenantId !== null}
              onChoose={() => choose(option)}
            />
          </li>
        ))}
      </ul>
      {errorMessage && (
        <p className="mt-3 text-center text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </>
  );
}

function TenantOptionButton({
  option,
  pending,
  disabled,
  onChoose,
}: {
  option: TenantMembershipOption;
  pending: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const unavailable = option.status !== TenantStatus.ACTIVE;
  return (
    <button
      type="button"
      disabled={disabled || unavailable}
      onClick={onChoose}
      data-testid={`tenant-option-${option.slug}`}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      <TenantLogo name={option.name} logoUrl={option.logoIconUrl} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{option.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {unavailable ? unavailableLabel(option.status) : option.slug}
        </span>
      </span>
      {pending && <Loader2 className="size-4 animate-spin" />}
    </button>
  );
}

function TenantLogo({ name, logoUrl }: { name: string; logoUrl: string }) {
  if (logoUrl.length > 0) {
    return (
      <img src={logoUrl} alt="" className="size-8 rounded-md object-contain" />
    );
  }
  return (
    <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-sm font-medium text-primary">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export { TenantLogo, TenantSelectionStep };

type TenantSelectionStepProps = {
  selectionToken: string;
  onBack: () => void;
  onChallenge: (challenge: LoginChallenge) => void;
};

function unavailableLabel(status: TenantStatus): string {
  return status === TenantStatus.DELETING ? t('Deleting') : t('Suspended');
}
