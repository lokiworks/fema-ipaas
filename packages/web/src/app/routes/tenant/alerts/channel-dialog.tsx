import {
  formErrors,
  NotificationChannel,
  NotificationChannelType,
  UpsertNotificationChannelRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { alertsHooks, alertUiUtils } from '@/features/alerts';

export function ChannelDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: NotificationChannel | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <ChannelForm
          key={open ? `${existing?.id ?? 'new'}-open` : 'closed'}
          existing={existing}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function ChannelForm({
  existing,
  onOpenChange,
}: {
  existing: NotificationChannel | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: capabilities } = alertsHooks.useCapabilities();
  const { mutate: save, isPending } = alertsHooks.useSaveChannel();
  const form = useForm<UpsertNotificationChannelRequestBody>({
    resolver: zodResolver(UpsertNotificationChannelRequestBody),
    mode: 'onChange',
    defaultValues: defaultValuesFor(existing),
  });
  const type = form.watch('type');
  const emailUnavailable = capabilities?.emailConfigured === false;

  const handleSubmit = (values: UpsertNotificationChannelRequestBody) => {
    const missingUrl =
      values.type !== NotificationChannelType.EMAIL &&
      (values.url ?? '').length === 0;
    if (missingUrl && (existing === null || existing.type !== values.type)) {
      form.setError('url', { type: 'manual', message: formErrors.required });
      return;
    }
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
            {existing ? t('Edit channel') : t('New channel')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Where alerts are delivered. Save the channel first, then send a test message.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  maxLength={30}
                  placeholder={t('e.g. Platform on-call group')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Type')}</FormLabel>
              <Select
                value={field.value}
                onValueChange={(value) =>
                  form.setValue('type', toChannelType(value), {
                    shouldValidate: true,
                  })
                }
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(NotificationChannelType).map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      disabled={
                        option === NotificationChannelType.EMAIL &&
                        emailUnavailable
                      }
                    >
                      {alertUiUtils.channelTypeLabel(option)}
                      {option === NotificationChannelType.EMAIL &&
                      emailUnavailable
                        ? ` · ${t('Configure SMTP first')}`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {type === NotificationChannelType.EMAIL ? (
          <FormField
            control={form.control}
            name="recipients"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Recipients')}</FormLabel>
                <FormControl>
                  <Input
                    value={(field.value ?? []).join(', ')}
                    placeholder="ops@example.com, oncall@example.com"
                    onChange={(event) =>
                      field.onChange(
                        event.target.value
                          .split(/[,，]/)
                          .map((part) => part.trim())
                          .filter((part) => part.length > 0),
                      )
                    }
                  />
                </FormControl>
                <FormDescription>
                  {t('Up to 20 addresses, separated by commas.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <>
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Webhook URL')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      placeholder={
                        existing && existing.type === type
                          ? t('Leave empty to keep the current URL')
                          : URL_PLACEHOLDERS[type]
                      }
                    />
                  </FormControl>
                  {type === NotificationChannelType.WEBHOOK && (
                    <FormDescription>
                      {t(
                        'Internal addresses must be added to the outbound allow list (FEMA_SSRF_ALLOW_LIST).',
                      )}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            {SIGNED_TYPES.includes(type) && (
              <FormField
                control={form.control}
                name="secret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Signing secret (optional)')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        type="password"
                        autoComplete="off"
                        placeholder={
                          existing?.hasSecret
                            ? t('Leave empty to keep the current secret')
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </>
        )}
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
  existing: NotificationChannel | null,
): UpsertNotificationChannelRequestBody {
  if (existing === null) {
    return {
      name: '',
      type: NotificationChannelType.FEISHU,
      url: '',
      recipients: [],
    };
  }
  return {
    name: existing.name,
    type: existing.type,
    url: '',
    recipients:
      existing.type === NotificationChannelType.EMAIL
        ? existing.target.split(', ')
        : [],
  };
}

function toChannelType(value: string): NotificationChannelType {
  return (
    Object.values(NotificationChannelType).find((option) => option === value) ??
    NotificationChannelType.WEBHOOK
  );
}

const SIGNED_TYPES = [
  NotificationChannelType.FEISHU,
  NotificationChannelType.DINGTALK,
  NotificationChannelType.WEBHOOK,
];

const URL_PLACEHOLDERS: Record<NotificationChannelType, string> = {
  [NotificationChannelType.FEISHU]:
    'https://open.feishu.cn/open-apis/bot/v2/hook/…',
  [NotificationChannelType.WECOM]:
    'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',
  [NotificationChannelType.DINGTALK]:
    'https://oapi.dingtalk.com/robot/send?access_token=…',
  [NotificationChannelType.SLACK]: 'https://hooks.slack.com/services/…',
  [NotificationChannelType.WEBHOOK]: 'https://oncall.example.com/hooks/…',
  [NotificationChannelType.EMAIL]: '',
};
