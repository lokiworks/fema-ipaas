import { MAX_ORGANIZATION_NAME_LENGTH } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Input } from '@/components/ui/input';

import { OrganizationErrors, WizardDraft } from '../utils/setup-wizard-utils';

import { WizardField } from './wizard-field';

export function OrganizationStep({
  draft,
  errors,
  visible,
  onChange,
  onBlur,
}: {
  draft: WizardDraft;
  errors: OrganizationErrors;
  visible: boolean;
  onChange: (patch: Partial<WizardDraft>) => void;
  onBlur: () => void;
}) {
  const error = visible ? errors.organizationName : null;
  return (
    <WizardField
      id="setup-organization"
      label={t('Organization name')}
      hint={t(
        'Shown on the sign-in page, in emails and in the console. You can change it later in Settings.',
      )}
      error={error}
    >
      <Input
        id="setup-organization"
        autoFocus
        maxLength={MAX_ORGANIZATION_NAME_LENGTH * 2}
        value={draft.organizationName}
        placeholder={t('For example: Acme Technology')}
        aria-invalid={error !== null}
        aria-describedby={error ? 'setup-organization-error' : undefined}
        onChange={(event) => onChange({ organizationName: event.target.value })}
        onBlur={onBlur}
      />
      <span className="self-end text-xs text-muted-foreground">
        {draft.organizationName.trim().length}/{MAX_ORGANIZATION_NAME_LENGTH}
      </span>
    </WizardField>
  );
}
