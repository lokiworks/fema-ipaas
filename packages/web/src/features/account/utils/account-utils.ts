import {
  NotificationDeliveryChannel,
  NotificationPreferenceEvent,
  NotificationPreferences,
  PersonalAccessTokenExpiry,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

function setPreference({
  preferences,
  event,
  channel,
  value,
}: SetPreferenceParams): NotificationPreferences {
  return {
    ...preferences,
    [event]: { ...preferences[event], [channel]: value },
  };
}

function preferenceLabel(event: NotificationPreferenceEvent): string {
  switch (event) {
    case 'runFailed':
      return t('My workflow runs fail');
    case 'connectionBroken':
      return t('My connection authorization breaks');
    case 'projectMemberAdded':
      return t('I am added to a project');
    case 'weeklyDigest':
      return t('Weekly run summary');
  }
}

function expiryLabel(expiry: PersonalAccessTokenExpiry): string {
  switch (expiry) {
    case PersonalAccessTokenExpiry.DAYS_30:
      return t('30 days');
    case PersonalAccessTokenExpiry.DAYS_90:
      return t('90 days');
    case PersonalAccessTokenExpiry.DAYS_365:
      return t('1 year');
    case PersonalAccessTokenExpiry.NEVER:
      return t('Never expires');
  }
}

function timezoneLabel(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offsetHours = -new Date().getTimezoneOffset() / 60;
    const sign = offsetHours >= 0 ? '+' : '';
    return t('Follows the browser ({zone}, GMT{offset})', {
      zone,
      offset: `${sign}${offsetHours}`,
    });
  } catch {
    return t('Follows the browser');
  }
}

function displayName({
  firstName,
  lastName,
}: {
  firstName: string;
  lastName: string;
}): string {
  return `${firstName} ${lastName}`.trim();
}

function isExpired({
  expiresAt,
  now,
}: {
  expiresAt: string | null | undefined;
  now: Date;
}): boolean {
  return (
    typeof expiresAt === 'string' &&
    new Date(expiresAt).getTime() <= now.getTime()
  );
}

export const accountUtils = {
  setPreference,
  preferenceLabel,
  expiryLabel,
  timezoneLabel,
  displayName,
  isExpired,
};

export const TOKEN_EXPIRY_OPTIONS: PersonalAccessTokenExpiry[] = [
  PersonalAccessTokenExpiry.DAYS_30,
  PersonalAccessTokenExpiry.DAYS_90,
  PersonalAccessTokenExpiry.DAYS_365,
  PersonalAccessTokenExpiry.NEVER,
];

type SetPreferenceParams = {
  preferences: NotificationPreferences;
  event: NotificationPreferenceEvent;
  channel: NotificationDeliveryChannel;
  value: boolean;
};
