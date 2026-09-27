import { SeekPage } from '@fema-ipaas/core-utils';
import { Notification, NotificationUnreadCount } from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const notificationsApi = {
  list({
    unreadOnly,
    cursor,
  }: {
    unreadOnly: boolean;
    cursor?: string;
  }): Promise<SeekPage<Notification>> {
    return api.get<SeekPage<Notification>>('/v1/notifications', {
      unreadOnly: unreadOnly ? 'true' : 'false',
      limit: PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
  },
  unreadCount(): Promise<NotificationUnreadCount> {
    return api.get<NotificationUnreadCount>('/v1/notifications/unread-count');
  },
  markRead(id: string): Promise<void> {
    return api.post<void>(`/v1/notifications/${id}/read`);
  },
  markAllRead(): Promise<void> {
    return api.post<void>('/v1/notifications/read-all');
  },
};

const PAGE_SIZE = 30;
