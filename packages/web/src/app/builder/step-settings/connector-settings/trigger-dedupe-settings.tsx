import {
  KeyPathError,
  TriggerDedupeSettings,
  triggerRunSettingsUtils,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Filter, ShieldCheck } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
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
import { projectCollectionUtils } from '@/features/projects';
import { triggerRuntimeHooks } from '@/features/trigger-runtime';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

export function TriggerDedupeSettingsSection({
  disabled,
  workflowId,
  sample,
}: {
  disabled: boolean;
  workflowId: string;
  sample: unknown;
}) {
  const form = useFormContext();
  const watched: unknown = useWatch({
    control: form.control,
    name: DEDUPE_FIELD,
  });
  const parsed = TriggerDedupeSettings.safeParse(watched);
  const settings = parsed.success ? parsed.data : DEFAULT_SETTINGS;
  const { project } = projectCollectionUtils.useCurrentProject();
  const { data: stats } = triggerRuntimeHooks.useDedupedEventStats({
    projectId: project?.id,
    workflowId,
    enabled: settings.enabled,
  });
  const candidates = triggerRunSettingsUtils.keyCandidates(sample);
  const keyError = settings.enabled
    ? triggerRunSettingsUtils.validateKeyPath(settings.keyPath)
    : null;
  const preview =
    settings.enabled && keyError === null
      ? triggerRunSettingsUtils.readKey({
          payload: sample,
          keyPath: settings.keyPath,
        })
      : null;
  const update = (patch: Partial<TriggerDedupeSettings>) =>
    form.setValue(
      DEDUPE_FIELD,
      { ...settings, ...patch },
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
  const blockedCount = stats?.lastSevenDays ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <Label>{t('Skip duplicate events')}</Label>
        </div>
        <Switch
          checked={settings.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) =>
            update({
              enabled,
              keyPath:
                enabled && settings.keyPath.length === 0 && candidates[0]
                  ? candidates[0].path
                  : settings.keyPath,
            })
          }
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {t(
          'Upstream systems may send the same event more than once. Events with the same key inside the window are processed only once; the rest are recorded as deduplicated and link back to the run that handled the first one.',
        )}
      </span>
      {settings.enabled && (
        <>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t('Dedupe key')}</Label>
            <Input
              className={cn(
                'font-mono text-xs',
                keyError !== null && 'border-destructive',
              )}
              value={settings.keyPath}
              disabled={disabled}
              placeholder="body.order_no"
              onChange={(event) => update({ keyPath: event.target.value })}
            />
            {candidates.length > 0 && !disabled && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-muted-foreground">
                  {t('Suggested')}
                </span>
                {candidates.slice(0, 4).map((candidate) => (
                  <Button
                    key={candidate.path}
                    type="button"
                    size="sm"
                    variant={
                      settings.keyPath === candidate.path
                        ? 'secondary'
                        : 'outline'
                    }
                    className="h-6 px-2 font-mono text-xs"
                    onClick={() => update({ keyPath: candidate.path })}
                  >
                    {candidate.path}
                  </Button>
                ))}
              </div>
            )}
            {keyError !== null && (
              <span className="text-xs text-destructive">
                {t(KEY_ERROR_MESSAGES[keyError])}
              </span>
            )}
            {keyError === null && (
              <span className="text-xs text-muted-foreground">
                {preview === null
                  ? t(
                      'The key is a path in the trigger output, for example body.order_no, or {example} to combine fields.',
                      { example: '{{trigger.body.a}}-{{trigger.body.b}}' },
                    )
                  : t('With the sample data, the key is {value}', {
                      value: preview,
                    })}
              </span>
            )}
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
            <span className="text-xs text-muted-foreground">
              {t(
                'An event whose key was seen inside the window is skipped; after the window it is processed again. Records carry over to newly published versions.',
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs">
            <Filter className="size-3.5 text-muted-foreground" />
            <span className="grow">
              {t('Blocked {count} duplicate events in the last 7 days', {
                count: blockedCount,
              })}
            </span>
            {blockedCount > 0 && (
              <Link
                className="text-primary hover:underline"
                to={authenticationSession.appendProjectRoutePrefix(
                  `/runs?view=deduped&workflowId=${workflowId}`,
                )}
              >
                {t('View')}
              </Link>
            )}
          </div>
        </>
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
const KEY_ERROR_MESSAGES: Record<KeyPathError, string> = {
  [KeyPathError.EMPTY]: 'Set a dedupe key to turn on deduplication',
  [KeyPathError.INVALID]:
    'Use a path such as body.order_no, without spaces or other characters',
  [KeyPathError.NOT_TRIGGER_OUTPUT]:
    'The dedupe key can only reference the trigger output',
};
