import { t } from 'i18next';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PasswordRequirementsList,
  PasswordStrengthBolt,
} from '@/features/authentication/components/password-validator';

import { AdministratorErrors, WizardDraft } from '../utils/setup-wizard-utils';

import { WizardField } from './wizard-field';

export function AdministratorStep({
  draft,
  errors,
  visible,
  passwordWasDiscarded,
  onChange,
  onBlur,
}: {
  draft: WizardDraft;
  errors: AdministratorErrors;
  visible: (field: keyof AdministratorErrors) => boolean;
  passwordWasDiscarded: boolean;
  onChange: (patch: Partial<WizardDraft>) => void;
  onBlur: (field: keyof AdministratorErrors) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const shown = (field: keyof AdministratorErrors) =>
    visible(field) ? errors[field] : null;
  return (
    <div className="flex flex-col gap-4">
      {passwordWasDiscarded && (
        <Alert variant="warning">
          <AlertDescription>
            {t(
              'For safety the password is not kept when the page is reloaded. Enter it again to continue.',
            )}
          </AlertDescription>
        </Alert>
      )}
      <WizardField
        id="setup-name"
        label={t('Full name')}
        error={shown('fullName')}
      >
        <Input
          id="setup-name"
          autoFocus
          autoComplete="name"
          value={draft.fullName}
          placeholder={t('For example: Lin Xiao')}
          aria-invalid={shown('fullName') !== null}
          aria-describedby={shown('fullName') ? 'setup-name-error' : undefined}
          onChange={(event) => onChange({ fullName: event.target.value })}
          onBlur={() => onBlur('fullName')}
        />
      </WizardField>
      <WizardField
        id="setup-email"
        label={t('Email')}
        hint={t('Used to sign in and to receive system notifications.')}
        error={shown('email')}
      >
        <Input
          id="setup-email"
          type="email"
          autoComplete="username"
          value={draft.email}
          placeholder="admin@example.com"
          aria-invalid={shown('email') !== null}
          aria-describedby={shown('email') ? 'setup-email-error' : undefined}
          onChange={(event) => onChange({ email: event.target.value })}
          onBlur={() => onBlur('email')}
        />
      </WizardField>
      <WizardField
        id="setup-password"
        label={t('Password')}
        error={shown('password')}
      >
        <div className="relative flex items-center">
          <Input
            id="setup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className="pr-16"
            value={draft.password}
            aria-invalid={shown('password') !== null}
            aria-describedby={
              shown('password') ? 'setup-password-error' : undefined
            }
            onChange={(event) => onChange({ password: event.target.value })}
            onBlur={() => onBlur('password')}
          />
          <div className="absolute right-1 flex items-center gap-0.5">
            <PasswordStrengthBolt password={draft.password} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              tabIndex={-1}
              aria-label={
                showPassword ? t('Hide password') : t('Show password')
              }
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </Button>
          </div>
        </div>
        <PasswordRequirementsList
          password={draft.password}
          isSubmitted={visible('password')}
        />
      </WizardField>
      <WizardField
        id="setup-confirm"
        label={t('Confirm password')}
        error={shown('confirmPassword')}
      >
        <Input
          id="setup-confirm"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={draft.confirmPassword}
          aria-invalid={shown('confirmPassword') !== null}
          aria-describedby={
            shown('confirmPassword') ? 'setup-confirm-error' : undefined
          }
          onChange={(event) =>
            onChange({ confirmPassword: event.target.value })
          }
          onBlur={() => onBlur('confirmPassword')}
        />
      </WizardField>
    </div>
  );
}
