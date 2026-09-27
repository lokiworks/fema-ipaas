import {
  FlagId,
  NOTIFICATION_PREFERENCE_EVENTS,
  NotificationDeliveryChannel,
  NotificationPreferenceEvent,
  NotificationPreferences,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { toast } from 'sonner';

import { MessageTooltip } from '@/components/custom/message-tooltip';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { flagsHooks } from '@/hooks/flags-hooks';

import { accountHooks } from '../hooks/account-hooks';
import { accountUtils } from '../utils/account-utils';

export function NotificationPreferencesCard() {
  const { data: preferences, isLoading } =
    accountHooks.useNotificationPreferences();
  const update = accountHooks.useUpdateNotificationPreferences();
  const { data: smtpConfigured } = flagsHooks.useFlag<boolean>(
    FlagId.SMTP_CONFIGURED,
  );
  const emailAvailable = smtpConfigured === true;

  const toggle = ({
    current,
    event,
    channel,
    value,
  }: {
    current: NotificationPreferences;
    event: NotificationPreferenceEvent;
    channel: NotificationDeliveryChannel;
    value: boolean;
  }) => {
    update.mutate(
      accountUtils.setPreference({
        preferences: current,
        event,
        channel,
        value,
      }),
      { onError: () => toast.error(t('Failed to save the preference')) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Notification preferences')}</CardTitle>
        <CardDescription>
          {t('In-app notifications are always on.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading || !preferences ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          NOTIFICATION_PREFERENCE_EVENTS.map((event) => (
            <div key={event} className="flex items-center gap-4 text-sm">
              <span className="min-w-0 flex-1">
                {accountUtils.preferenceLabel(event)}
              </span>
              <MessageTooltip
                isDisabled={true}
                message="Instant-messaging delivery needs a Feishu, WeCom or DingTalk sign-in, which is not set up on this platform"
              >
                <div className="flex items-center gap-1.5">
                  <Checkbox id={`${event}-im`} checked={false} disabled />
                  <Label
                    htmlFor={`${event}-im`}
                    className="text-muted-foreground"
                  >
                    {t('Instant messaging')}
                  </Label>
                </div>
              </MessageTooltip>
              <MessageTooltip
                isDisabled={!emailAvailable}
                message="The administrator has not configured an email service (SMTP)"
              >
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id={`${event}-email`}
                    checked={emailAvailable && preferences[event].email}
                    disabled={!emailAvailable || update.isPending}
                    onCheckedChange={(checked) =>
                      toggle({
                        current: preferences,
                        event,
                        channel: 'email',
                        value: checked === true,
                      })
                    }
                  />
                  <Label htmlFor={`${event}-email`}>{t('Email')}</Label>
                </div>
              </MessageTooltip>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
