import {
  BACKUP_KEEP_MAX,
  BACKUP_KEEP_MIN,
  BackupFrequency,
  BackupOverview,
  UpdateBackupSettingsRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import { backupHooks } from '../hooks/backup-hooks';
import { backupText } from '../utils/backup-text';
import { backupTime } from '../utils/backup-time';

export function BackupPlanCard({ overview }: { overview: BackupOverview }) {
  return (
    <BackupPlanForm
      key={JSON.stringify(overview.settings)}
      overview={overview}
    />
  );
}

function BackupPlanForm({ overview }: { overview: BackupOverview }) {
  const update = backupHooks.useUpdateSettings();
  const form = useForm<UpdateBackupSettingsRequestBody>({
    resolver: zodResolver(UpdateBackupSettingsRequestBody),
    mode: 'onChange',
    defaultValues: overview.settings,
  });
  const enabled = form.watch('enabled');
  const frequency = form.watch('frequency');
  const keepOptions = keepOptionsOf({ saved: overview.settings.keep });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => update.mutate(values))}>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <CardTitle>{t('Backup plan')}</CardTitle>
              <CardDescription>
                {t(
                  'Backups are written to {directory} on the server. Only one server runs the schedule, even when several are running.',
                  { directory: overview.directory },
                )}
              </CardDescription>
            </div>
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Switch
                      aria-label={t('Run backups on a schedule')}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!enabled && (
              <p className="text-sm text-warning-700 dark:text-warning-300">
                {t(
                  'The schedule is off. Nothing is backed up unless you do it by hand.',
                )}
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Frequency')}</FormLabel>
                    <Select
                      disabled={!enabled}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={BackupFrequency.DAILY}>
                          {t('Every day')}
                        </SelectItem>
                        <SelectItem value={BackupFrequency.WEEKLY}>
                          {t('Every week')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {frequency === BackupFrequency.WEEKLY && (
                <FormField
                  control={form.control}
                  name="weekday"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Day of the week')}</FormLabel>
                      <Select
                        disabled={!enabled}
                        value={String(field.value)}
                        onValueChange={(value) => field.onChange(Number(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {WEEKDAY_ORDER.map((weekday) => (
                            <SelectItem key={weekday} value={String(weekday)}>
                              {backupText.weekdayLabel({ weekday })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="hour"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Time')}</FormLabel>
                    <Select
                      disabled={!enabled}
                      value={String(field.value)}
                      onValueChange={(value) => field.onChange(Number(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {HOURS.map((hour) => (
                          <SelectItem key={hour} value={String(hour)}>
                            {`${String(hour).padStart(2, '0')}:00`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t('Server time zone: {zone}', {
                        zone: overview.serverTimezone,
                      })}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="keep"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>{t('Scheduled backups to keep')}</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {keepOptions.map((count) => (
                        <SelectItem key={count} value={String(count)}>
                          {t('{count} backups', { count })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t(
                      'The oldest scheduled backups beyond this are deleted. Manual backups are never deleted automatically.',
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="uploadToObjectStorage"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <FormLabel>
                      {t('Also copy backups to object storage')}
                    </FormLabel>
                    <FormDescription>
                      {overview.objectStorageAvailable
                        ? t(
                            'A copy of each backup is uploaded to the configured object storage, under backups/. The local copy is always kept.',
                          )
                        : t(
                            'Object storage is not configured, so backups stay on this server only. Configure it under System and upgrades, Optional services.',
                          )}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      aria-label={t('Also copy backups to object storage')}
                      disabled={!overview.objectStorageAvailable}
                      checked={field.value && overview.objectStorageAvailable}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">
                {nextRunText({ overview })}
              </span>
              <Button
                type="submit"
                loading={update.isPending}
                disabled={!form.formState.isDirty || !form.formState.isValid}
              >
                {t('Save plan')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}

function keepOptionsOf({ saved }: { saved: number }): number[] {
  const options = KEEP_OPTIONS.includes(saved)
    ? KEEP_OPTIONS
    : [...KEEP_OPTIONS, saved].sort((left, right) => left - right);
  return options.filter(
    (count) => count >= BACKUP_KEEP_MIN && count <= BACKUP_KEEP_MAX,
  );
}

function nextRunText({ overview }: { overview: BackupOverview }): string {
  if (!overview.settings.enabled || !overview.nextRunAt) {
    return t('No scheduled backup is planned.');
  }
  return t('Next scheduled backup: {time}', {
    time: backupTime.inServerZone({
      iso: overview.nextRunAt,
      zone: overview.serverTimezone,
    }),
  });
}

const KEEP_OPTIONS = [3, 7, 14, 30, 60, 90];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
