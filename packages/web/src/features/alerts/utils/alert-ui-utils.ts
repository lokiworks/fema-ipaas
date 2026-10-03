import {
  AlertPolicy,
  AlertRecordStatus,
  AlertTriggerEvent,
  NotificationChannelType,
  UpsertAlertPolicyRequestInput,
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

function policyFormDefaults({
  existing,
}: {
  existing: AlertPolicy | null;
}): UpsertAlertPolicyRequestInput {
  if (existing !== null) {
    return {
      name: existing.name,
      enabled: existing.enabled,
      projectIds: existing.projectIds,
      workflowIds: existing.workflowIds,
      events: existing.events,
      failureRate: existing.failureRate ?? DEFAULT_FAILURE_RATE,
      capacityThresholdPercent:
        existing.capacityThresholdPercent ?? DEFAULT_CAPACITY_THRESHOLD,
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
    capacityThresholdPercent: DEFAULT_CAPACITY_THRESHOLD,
    groupWindowMinutes: 30,
    quietHours: {
      enabled: false,
      from: '22:00',
      to: '08:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    escalation: { enabled: false, afterMinutes: 60, channelId: null },
    channelIds: [],
  };
}

const DEFAULT_FAILURE_RATE = { thresholdPercent: 20, windowMinutes: 60 };
const DEFAULT_CAPACITY_THRESHOLD = 80;

export const alertUiUtils = {
  channelTypeLabel,
  eventLabel,
  recordStatusLabel,
  windowLabel,
  policyFormDefaults,
  defaultCapacityThreshold: DEFAULT_CAPACITY_THRESHOLD,
};
