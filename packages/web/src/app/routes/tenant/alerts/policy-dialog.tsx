import {
  AlertPolicy,
  AlertTriggerEvent,
  FAILURE_RATE_WINDOWS_MINUTES,
  NotificationChannel,
  NotificationChannelStatus,
  UpsertAlertPolicyRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { alertsHooks, alertUiUtils } from '@/features/alerts';
import { projectCollectionUtils } from '@/features/projects';

export function PolicyDialog({
  open,
  onOpenChange,
  existing,
  channels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: AlertPolicy | null;
  channels: NotificationChannel[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <PolicyForm
          key={open ? `${existing?.id ?? 'new'}-open` : 'closed'}
          existing={existing}
          channels={channels}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function PolicyForm({
  existing,
  channels,
  onOpenChange,
}: {
  existing: AlertPolicy | null;
  channels: NotificationChannel[];
  onOpenChange: (open: boolean) => void;
}) {
  const { data: projects } = projectCollectionUtils.useAll();
  const { mutate: save, isPending } = alertsHooks.useSavePolicy();
  const form = useForm<UpsertAlertPolicyRequestBody>({
    resolver: zodResolver(UpsertAlertPolicyRequestBody),
    mode: 'onChange',
    defaultValues: defaultValuesFor(existing),
  });
  const events = form.watch('events');
  const quietEnabled = form.watch('quietHours.enabled');
  const escalationEnabled = form.watch('escalation.enabled');

  const handleSubmit = (values: UpsertAlertPolicyRequestBody) => {
    save(
      { id: existing?.id ?? null, request: values },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>
            {existing ? t('Edit alert policy') : t('New alert policy')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Decides when to notify whom. Failures of the same issue inside the grouping window only notify once.',
            )}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Name')}</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={30} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="projectIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Projects')}</FormLabel>
                  <FormDescription>
                    {t('Leave all unchecked to cover every project.')}
                  </FormDescription>
                  <div className="grid grid-cols-2 gap-2">
                    {projects.map((project) => (
                      <label
                        key={project.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={field.value.includes(project.id)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              toggle({
                                values: field.value,
                                value: project.id,
                                checked: checked === true,
                              }),
                            )
                          }
                        />
                        {project.displayName}
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="events"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Trigger when')}</FormLabel>
                  <div className="flex flex-col gap-2">
                    {Object.values(AlertTriggerEvent).map((event) => (
                      <label
                        key={event}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={field.value.includes(event)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              toggle({
                                values: field.value,
                                value: event,
                                checked: checked === true,
                              }),
                            )
                          }
                        />
                        {alertUiUtils.eventLabel(event)}
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            {events.includes(AlertTriggerEvent.FAILURE_RATE) && (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="failureRate.thresholdPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Threshold (%)')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="failureRate.windowMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Measured over')}</FormLabel>
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
                          {FAILURE_RATE_WINDOWS_MINUTES.map((minutes) => (
                            <SelectItem key={minutes} value={String(minutes)}>
                              {alertUiUtils.windowLabel(minutes)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
            )}
            <FormField
              control={form.control}
              name="groupWindowMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Grouping window (minutes)')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {t('The same issue notifies at most once in this window.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quietHours.enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <FormLabel>{t('Quiet hours')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Alerts during quiet hours are sent together when they end. Escalations are not delayed.',
                      )}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            {quietEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="quietHours.from"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('From')}</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quietHours.to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('To')}</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            <FormField
              control={form.control}
              name="escalation.enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <FormLabel>{t('Escalate unhandled issues')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Notify another channel when an issue stays open and unassigned.',
                      )}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            {escalationEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="escalation.afterMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('After (minutes)')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={5}
                          max={1440}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="escalation.channelId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Escalation channel')}</FormLabel>
                      <Select
                        value={field.value ?? undefined}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('Select a channel')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {channels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id}>
                              {channel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            <FormField
              control={form.control}
              name="channelIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Notify')}</FormLabel>
                  <div className="flex flex-col gap-2">
                    {channels.map((channel) => (
                      <label
                        key={channel.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={field.value.includes(channel.id)}
                          disabled={
                            channel.status !== NotificationChannelStatus.ACTIVE
                          }
                          onCheckedChange={(checked) =>
                            field.onChange(
                              toggle({
                                values: field.value,
                                value: channel.id,
                                checked: checked === true,
                              }),
                            )
                          }
                        />
                        {channel.name}
                        <span className="text-muted-foreground">
                          · {alertUiUtils.channelTypeLabel(channel.type)}
                        </span>
                      </label>
                    ))}
                    {channels.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        {t('Create a notification channel first.')}
                      </p>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-2">
                  <FormLabel>{t('Enabled')}</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function defaultValuesFor(
  existing: AlertPolicy | null,
): UpsertAlertPolicyRequestBody {
  if (existing !== null) {
    return {
      name: existing.name,
      enabled: existing.enabled,
      projectIds: existing.projectIds,
      workflowIds: existing.workflowIds,
      events: existing.events,
      failureRate: existing.failureRate ?? DEFAULT_FAILURE_RATE,
      groupWindowMinutes: existing.groupWindowMinutes,
      quietHours: existing.quietHours,
      escalation: existing.escalation,
      channelIds: existing.channelIds,
    };
  }
  return {
    name: '',
    enabled: true,
    projectIds: [],
    workflowIds: [],
    events: [AlertTriggerEvent.ISSUE_NEW, AlertTriggerEvent.ISSUE_REOPENED],
    failureRate: DEFAULT_FAILURE_RATE,
    groupWindowMinutes: 30,
    quietHours: {
      enabled: true,
      from: '22:00',
      to: '08:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    escalation: { enabled: false, afterMinutes: 60, channelId: null },
    channelIds: [],
  };
}

function toggle<T>({
  values,
  value,
  checked,
}: {
  values: T[];
  value: T;
  checked: boolean;
}): T[] {
  return checked
    ? [...values.filter((item) => item !== value), value]
    : values.filter((item) => item !== value);
}

const DEFAULT_FAILURE_RATE = { thresholdPercent: 20, windowMinutes: 60 };
