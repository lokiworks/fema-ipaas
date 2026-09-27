import { TriggerDedupeSettings } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useFormContext, useWatch } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function TriggerDedupeSettingsSection({
  disabled,
}: {
  disabled: boolean;
}) {
  const form = useFormContext();
  const watched: unknown = useWatch({
    control: form.control,
    name: DEDUPE_FIELD,
  });
  const parsed = TriggerDedupeSettings.safeParse(watched);
  const settings = parsed.success ? parsed.data : DEFAULT_SETTINGS;
  const update = (patch: Partial<TriggerDedupeSettings>) =>
    form.setValue(
      DEDUPE_FIELD,
      { ...settings, ...patch },
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <Label>{t('Skip duplicate events')}</Label>
          <span className="text-xs text-muted-foreground">
            {t(
              'Events with the same key inside the window are processed only once.',
            )}
          </span>
        </div>
        <Switch
          checked={settings.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => update({ enabled })}
        />
      </div>
      {settings.enabled && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t('Dedupe key')}</Label>
            <Input
              className="font-mono text-xs"
              value={settings.keyPath}
              disabled={disabled}
              placeholder="body.employee_id"
              onChange={(event) => update({ keyPath: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t('Window')}</Label>
            <Select
              value={String(settings.windowSeconds)}
              disabled={disabled}
              onValueChange={(value) =>
                update({ windowSeconds: Number(value) })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.seconds}
                    value={String(option.seconds)}
                  >
                    {option.label()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="col-span-2 text-xs text-muted-foreground">
            {t(
              'The key is a path in the trigger output, for example id or body.order_no.',
            )}
          </span>
        </div>
      )}
    </div>
  );
}

const DEDUPE_FIELD = 'settings.dedupe';
const HOUR = 60 * 60;
const DEFAULT_SETTINGS: TriggerDedupeSettings = {
  enabled: false,
  keyPath: '',
  windowSeconds: 7 * 24 * HOUR,
};
const WINDOW_OPTIONS = [
  { seconds: HOUR, label: () => t('1 hour') },
  { seconds: 24 * HOUR, label: () => t('24 hours') },
  { seconds: 7 * 24 * HOUR, label: () => t('7 days') },
  { seconds: 30 * 24 * HOUR, label: () => t('30 days') },
];
