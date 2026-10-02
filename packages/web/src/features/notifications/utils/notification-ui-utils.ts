import {
  Notification,
  NotificationType,
  TenantModule,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  BellIcon,
  CircleX,
  CloudUpload,
  Link2Off,
  LucideIcon,
  Lock,
  RotateCcw,
  ShieldCheck,
  Siren,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';

import { tenantAccessUtils } from '@/features/tenant-access/utils/tenant-access-utils';

function headline(notification: Notification): string {
  const actor = notification.actorName ?? t('Someone');
  switch (notification.type) {
    case NotificationType.RELEASE_REQUESTED:
      return t('{actor} asked you to approve a release', { actor });
    case NotificationType.RELEASE_APPROVED:
      return t('Your release was approved and is now live');
    case NotificationType.RELEASE_REJECTED:
      return t('Your release was rejected');
    case NotificationType.RELEASE_ROLLED_BACK:
      return t('{actor} rolled back a workflow', { actor });
    case NotificationType.AGENT_APPROVAL_REQUESTED:
      return t('An agent is waiting for your confirmation');
    case NotificationType.EDIT_LOCK_TAKEN_OVER:
      return t('{actor} took over editing', { actor });
    case NotificationType.DATA_ERASURE_FINISHED:
      return t('Personal data erasure finished');
    case NotificationType.DATA_ERASURE_FAILED:
      return t('Personal data erasure failed');
    case NotificationType.ISSUE_ASSIGNED:
      return t('{actor} assigned an issue to you', { actor });
    case NotificationType.MODULE_ACCESS_APPROVED:
      return t('Your access request was approved');
    case NotificationType.MODULE_ACCESS_REJECTED:
      return t('Your access request was rejected');
    case NotificationType.PROJECT_MEMBER_ADDED:
      return t('You were added to a project');
    case NotificationType.RUN_FAILED:
      return t('A workflow run failed');
    case NotificationType.CONNECTION_BROKEN:
      return t('A connection needs to be reconnected');
    case NotificationType.CONNECTION_REAUTH_REQUESTED:
      return t('{actor} asks you to reconnect a connection', { actor });
    case NotificationType.CAPACITY_THRESHOLD:
      return t('A project reached its monthly run limit threshold');
  }
}

function subject(notification: Notification): string {
  if (
    notification.type === NotificationType.MODULE_ACCESS_APPROVED ||
    notification.type === NotificationType.MODULE_ACCESS_REJECTED
  ) {
    return isTenantModule(notification.title)
      ? tenantAccessUtils.moduleLabel(notification.title)
      : notification.title;
  }
  return notification.title;
}

function icon(type: NotificationType): NotificationIcon {
  switch (type) {
    case NotificationType.RELEASE_REQUESTED:
    case NotificationType.RELEASE_APPROVED:
      return { icon: CloudUpload, className: 'text-primary' };
    case NotificationType.RELEASE_REJECTED:
      return { icon: CircleX, className: 'text-destructive' };
    case NotificationType.RELEASE_ROLLED_BACK:
      return { icon: RotateCcw, className: 'text-warning' };
    case NotificationType.AGENT_APPROVAL_REQUESTED:
      return { icon: UserCheck, className: 'text-warning' };
    case NotificationType.EDIT_LOCK_TAKEN_OVER:
      return { icon: Lock, className: 'text-warning' };
    case NotificationType.DATA_ERASURE_FINISHED:
      return { icon: Trash2, className: 'text-success' };
    case NotificationType.DATA_ERASURE_FAILED:
      return { icon: Trash2, className: 'text-destructive' };
    case NotificationType.ISSUE_ASSIGNED:
      return { icon: Siren, className: 'text-destructive' };
    case NotificationType.MODULE_ACCESS_APPROVED:
    case NotificationType.MODULE_ACCESS_REJECTED:
      return { icon: ShieldCheck, className: 'text-info' };
    case NotificationType.PROJECT_MEMBER_ADDED:
      return { icon: UserPlus, className: 'text-info' };
    case NotificationType.RUN_FAILED:
      return { icon: CircleX, className: 'text-destructive' };
    case NotificationType.CAPACITY_THRESHOLD:
      return { icon: Siren, className: 'text-warning' };
    case NotificationType.CONNECTION_BROKEN:
    case NotificationType.CONNECTION_REAUTH_REQUESTED:
      return { icon: Link2Off, className: 'text-warning' };
    default:
      return { icon: BellIcon, className: 'text-muted-foreground' };
  }
}

function isTenantModule(value: string): value is TenantModule {
  return Object.values<string>(TenantModule).includes(value);
}

function badgeLabel(count: number): string {
  return count > MAX_BADGE ? `${MAX_BADGE}+` : String(count);
}

export const notificationUiUtils = {
  headline,
  subject,
  icon,
  badgeLabel,
};

const MAX_BADGE = 99;

type NotificationIcon = {
  icon: LucideIcon;
  className: string;
};
