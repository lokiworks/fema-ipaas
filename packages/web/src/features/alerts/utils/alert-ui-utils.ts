import {
  AlertRecordStatus,
  AlertTriggerEvent,
  NotificationChannelType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

function channelTypeLabel(type: NotificationChannelType): string {
  switch (type) {
    case NotificationChannelType.FEISHU:
      return t('Feishu group bot');
    case NotificationChannelType.WECOM:
      return t('WeCom group bot');
    case NotificationChannelType.DINGTALK:
      return t('DingTalk group bot');
    case NotificationChannelType.SLACK:
      return t('Slack');
    case NotificationChannelType.WEBHOOK:
      return t('Webhook');
    case NotificationChannelType.EMAIL:
      return t('Email');
  }
}

function eventLabel(event: AlertTriggerEvent): string {
  switch (event) {
    case AlertTriggerEvent.ISSUE_NEW:
      return t('A new issue appears');
    case AlertTriggerEvent.ISSUE_REOPENED:
      return t('An issue reopens');
    case AlertTriggerEvent.CONNECTION_INVALID:
      return t('A connection stops working');
    case AlertTriggerEvent.FAILURE_RATE:
      return t('Failure rate exceeds a threshold');
    case AlertTriggerEvent.CAPACITY:
      return t('Monthly runs reach a capacity threshold');
  }
}

function recordStatusLabel(status: AlertRecordStatus): string {
  switch (status) {
    case AlertRecordStatus.PENDING:
      return t('Waiting for quiet hours to end');
    case AlertRecordStatus.SENT:
      return t('Sent');
    case AlertRecordStatus.FAILED:
      return t('Failed');
  }
}

function windowLabel(minutes: number): string {
  return minutes >= 60 && minutes % 60 === 0
    ? t('{hours} hours', { hours: minutes / 60 })
    : t('{minutes} minutes', { minutes });
}

export const alertUiUtils = {
  channelTypeLabel,
  eventLabel,
  recordStatusLabel,
  windowLabel,
};
