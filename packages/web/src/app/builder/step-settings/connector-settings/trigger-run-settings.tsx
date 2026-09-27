import { isManualConnectorTrigger } from '@fema-ipaas/core-utils';
import {
  ScheduleOverlapPolicy,
  scheduleUtils,
  TriggerConcurrencySettings,
  triggerRunSettingsUtils,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CalendarOff, Gauge, Info, Timer } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { MessageTooltip } from '@/components/custom/message-tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  scheduleFormat,
  triggerRuntimeHooks,
} from '@/features/trigger-runtime';

import { TriggerDedupeSettingsSection } from './trigger-dedupe-settings';

export function TriggerRunSettings({
  disabled,
  workflowId,
}: {
  disabled: boolean;
  workflowId: string;
}) {
  const form = useFormContext();
  const [stepName, connectorName, triggerName] = useWatch({
    control: form.control,
    name: ['name', 'settings.connectorName', 'settings.triggerName'],
  });
  const sample = useBuilderStateContext(
    (state) => state.outputSampleData[String(stepName)],
  );
  const identity = {
    connectorName: String(connectorName ?? ''),
    triggerName: typeof triggerName === 'string' ? triggerName : undefined,
  };
  if (
    isManualConnectorTrigger({
      connectorName: identity.connectorName,
      triggerName: identity.triggerName ?? '',
    })
  ) {
    return (
      <span className="text-sm text-muted-foreground">
        {t(
          'Manual runs start one at a time on request and have no run settings.',
        )}
      </span>
    );
  }
  const isSchedule = triggerRunSettingsUtils.supportsScheduleSettings(identity);
  return (
    <div className="flex flex-col gap-4">
      {identity.connectorName === WEBHOOK_CONNECTOR_NAME && (
        <Alert>
          <Info />
          <AlertDescription>
            {t(
              'Synchronous webhook calls (URLs ending in /sync) wait for the response, so they skip dedupe and concurrency limits.',
            )}
          </AlertDescription>
        </Alert>
      )}
      {triggerRunSettingsUtils.supportsDedupe(identity) && (
        <TriggerDedupeSettingsSection
          disabled={disabled}
          workflowId={workflowId}
          sample={sample}
        />
      )}
      <ConcurrencySection disabled={disabled} sample={sample} />
      {isSchedule && <ScheduleRunSection disabled={disabled} />}
    </div>
  );
}

function ConcurrencySection({
  disabled,
  sample,
}: {
  disabled: boolean;
  sample: unknown;
}) {
  const form = useFormContext();
  const watched: unknown = useWatch({
    control: form.control,
    name: CONCURRENCY_FIELD,
  });
  const parsed = TriggerConcurrencySettings.safeParse(watched);
  const settings = parsed.success ? parsed.data : { maxConcurrentRuns: 0 };
  const orderKeyPath = settings.orderKeyPath ?? '';
  const orderKeyError =
    orderKeyPath.trim().length === 0
      ? null
      : triggerRunSettingsUtils.validateKeyPath(orderKeyPath);
  const orderKeyPreview =
    orderKeyPath.trim().length > 0 && orderKeyError === null
      ? triggerRunSettingsUtils.readKey({
          payload: sample,
          keyPath: orderKeyPath,
        })
      : null;
  const update = (patch: Partial<TriggerConcurrencySettings>) =>
    form.setValue(
      CONCURRENCY_FIELD,
      { ...settings, ...patch },
      { shouldDirty: true, shouldValidate: true },
    );
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Gauge className="size-4 text-muted-foreground" />
        <Label>{t('Concurrency')}</Label>
      </div>
      <span className="text-xs text-muted-foreground">
        {t(
          'Limit how many runs of this workflow execute at the same time to protect rate-limited systems. Extra events wait in the queue and are not dropped.',
        )}
      </span>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{t('Maximum concurrent runs')}</Label>
        <Select
          value={String(settings.maxConcurrentRuns)}
          disabled={disabled}
          onValueChange={(value) =>
            update({ maxConcurrentRuns: Number(value) })
          }
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONCURRENCY_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {concurrencyLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {settings.maxConcurrentRuns !== 1 && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{t('Ordering key')}</Label>
          <Input
            className="font-mono text-xs"
            value={orderKeyPath}
            disabled={disabled}
            placeholder={t('Not set: order is not guaranteed')}
            onChange={(event) => update({ orderKeyPath: event.target.value })}
          />
          {orderKeyError !== null ? (
            <span className="text-xs text-destructive">
              {t('The ordering key can only reference the trigger output')}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {orderKeyPreview === null
                ? t(
                    'Optional. Events with the same key run one at a time in arrival order, different keys run in parallel. For example, approvals from the same applicant are handled in order.',
                  )
                : t('With the sample data, the key is {value}', {
                    value: orderKeyPreview,
                  })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ScheduleRunSection({ disabled }: { disabled: boolean }) {
  const form = useFormContext();
  const [triggerName, input, overlap, skipHolidays] = useWatch({
    control: form.control,
    name: [
      'settings.triggerName',
      'settings.input',
      'settings.scheduleOverlap',
      'settings.skipHolidays',
    ],
  });
  const { data: calendar } = triggerRuntimeHooks.useHolidayCalendar();
  const holidays = calendar?.dates ?? [];
  const schedule = scheduleUtils.scheduleOf({
    triggerName: typeof triggerName === 'string' ? triggerName : undefined,
    input: isRecord(input) ? input : {},
  });
  const cronInvalid =
    schedule?.kind === 'cron' && !scheduleUtils.validateCron(schedule.cron);
  const skipping = skipHolidays === true;
  const fireTimes =
    schedule === null || cronInvalid
      ? []
      : scheduleUtils.nextFireTimes({
          schedule,
          from: new Date(),
          count: PREVIEW_COUNT,
          excludeDates: skipping ? holidays : undefined,
        });
  const overlapValue = OVERLAP_OPTIONS.find(
    (option) => option.value === overlap,
  )
    ? String(overlap)
    : ScheduleOverlapPolicy.PARALLEL;
  const noCalendar = holidays.length === 0;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Timer className="size-4 text-muted-foreground" />
        <Label>{t('When the previous run has not finished')}</Label>
      </div>
      <RadioGroup
        value={overlapValue}
        disabled={disabled}
        onValueChange={(value) =>
          form.setValue('settings.scheduleOverlap', value, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      >
        {OVERLAP_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex items-start gap-2 text-sm"
            htmlFor={`overlap-${option.value}`}
          >
            <RadioGroupItem
              id={`overlap-${option.value}`}
              value={option.value}
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span>{t(option.label)}</span>
              <span className="text-xs text-muted-foreground">
                {t(option.description)}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarOff className="size-4 text-muted-foreground" />
          <Label>{t('Skip public holidays')}</Label>
        </div>
        <MessageTooltip
          isDisabled={noCalendar && !skipping}
          message={t(
            'No holiday calendar has been imported yet. Ask an administrator to import dates in the admin console.',
          )}
        >
          <Switch
            checked={skipping}
            disabled={disabled || (noCalendar && !skipping)}
            onCheckedChange={(value) =>
              form.setValue('settings.skipHolidays', value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </MessageTooltip>
      </div>
      {noCalendar ? (
        <span className="text-xs text-muted-foreground">
          {t(
            'Holidays come from the calendar your administrator imports. The calendar is empty, so no run is skipped.',
          )}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">
          {t(
            'Runs that fall on a date in the holiday calendar ({count} dates) are skipped.',
            { count: holidays.length },
          )}
        </span>
      )}
      <div className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          {t('Next {count} runs ({timezone})', {
            count: PREVIEW_COUNT,
            timezone: schedule?.timezone ?? 'UTC',
          })}
        </span>
        {cronInvalid && (
          <span className="text-destructive">{t('cronExpressionInvalid')}</span>
        )}
        {!cronInvalid && fireTimes.length === 0 && (
          <span className="text-muted-foreground">
            {t('No upcoming runs for the current settings')}
          </span>
        )}
        {fireTimes.map((date) => (
          <span key={date.getTime()} className="font-mono">
            {scheduleFormat.fireTime({
              date,
              timezone: schedule?.timezone ?? 'UTC',
            })}
          </span>
        ))}
        {schedule?.kind === 'interval' && (
          <span className="text-muted-foreground">
            {t(
              'Interval schedules count from when the workflow is published, so actual times may shift.',
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function concurrencyLabel(option: number): string {
  if (option === 0) {
    return t('Unlimited');
  }
  if (option === 1) {
    return t('1 (one at a time)');
  }
  return String(option);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CONCURRENCY_FIELD = 'settings.concurrency';
const WEBHOOK_CONNECTOR_NAME = '@fema-ipaas/connector-webhook';
const PREVIEW_COUNT = 5;
const CONCURRENCY_OPTIONS = [0, 1, 3, 5, 10, 20];
const OVERLAP_OPTIONS = [
  {
    value: ScheduleOverlapPolicy.SKIP,
    label: 'Skip this run',
    description: 'Good for reports and summaries, avoids counting twice',
  },
  {
    value: ScheduleOverlapPolicy.QUEUE,
    label: 'Wait in line',
    description: 'Runs right after the previous run finishes',
  },
  {
    value: ScheduleOverlapPolicy.PARALLEL,
    label: 'Run at the same time',
    description: 'Use when runs do not affect each other',
  },
];
