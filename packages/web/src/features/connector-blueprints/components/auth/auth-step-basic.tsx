import {
  BLUEPRINT_LIMITS,
  BlueprintAuth,
  BlueprintAuthProblem,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { authDraftUtils } from './auth-draft-utils';

export function AuthStepBasic({
  draft,
  setDraft,
  problems,
}: {
  draft: BlueprintAuth;
  setDraft: (auth: BlueprintAuth) => void;
  problems: BlueprintAuthProblem[];
}) {
  const nameInvalid = problems.includes(BlueprintAuthProblem.NAME);
  return (
    <section className="flex max-w-xl flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-col gap-1.5">
        <Label>
          {t('Authentication name')} <span className="text-destructive">*</span>
        </Label>
        <Input
          value={draft.name}
          maxLength={BLUEPRINT_LIMITS.name}
          aria-invalid={nameInvalid}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        {nameInvalid && (
          <p className="text-xs text-destructive">
            {t('Enter an authentication name')}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t('Authentication type')}</Label>
        <Input value={authDraftUtils.authTypeLabel(draft.type)} readOnly />
        <p className="text-xs text-muted-foreground">
          {t('The authentication type cannot be changed after creation')}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t('Authentication description')}</Label>
        <Textarea
          rows={3}
          value={draft.description}
          maxLength={BLUEPRINT_LIMITS.description}
          placeholder={t(
            'e.g. Generate an API Key in the service admin console under Open Platform',
          )}
          onChange={(event) =>
            setDraft({ ...draft, description: event.target.value })
          }
        />
        <p className="text-xs text-muted-foreground">
          {t(
            'Shown in the dialog users see when they create a connection, telling them where to get their credentials',
          )}
        </p>
      </div>
    </section>
  );
}
