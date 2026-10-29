import { t } from 'i18next';
import { EyeOff } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';

import { Switch } from '@/components/ui/switch';

export function SensitiveOutputToggle({ readonly }: { readonly: boolean }) {
  const form = useFormContext();
  const checked =
    useWatch({ control: form.control, name: 'settings.sensitiveOutput' }) ===
    true;
  return (
    <div className="mx-4 mt-3 flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <EyeOff className="size-4 text-muted-foreground" />
        <span className="grow text-sm font-medium">
          {t('Output contains sensitive information')}
        </span>
        <Switch
          checked={checked}
          disabled={readonly}
          aria-label={t('Output contains sensitive information')}
          onCheckedChange={(next) =>
            form.setValue('settings.sensitiveOutput', next, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {checked
          ? t(
              'Every field of this output is masked in run logs, and the same values (4 characters or longer) are masked wherever later steps show them. Viewing the original needs permission and is audited.',
            )
          : t(
              'In run logs, phone numbers, ID numbers, bank cards, emails and secrets are masked by the platform rules. Test samples in the editor stay unmasked so you can map fields. Turn this on when the whole output is sensitive.',
            )}
      </p>
    </div>
  );
}
