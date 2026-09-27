import { Notification, WebsocketClientEvent } from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useSocket } from '@/components/providers/socket-provider';

import { notificationsApi } from '../api/notifications-api';

export const notificationKeys = {
  all: ['notifications'],
  list: (unreadOnly: boolean) => ['notifications', 'list', unreadOnly],
  unreadCount: ['notifications', 'unread-count'],
};

export const notificationsHooks = {
  useUnreadCount: () => {
    return useQuery({
      queryKey: notificationKeys.unreadCount,
      queryFn: () => notificationsApi.unreadCount(),
      staleTime: 60_000,
      refetchInterval: 5 * 60_000,
    });
  },
  useList: ({
    unreadOnly,
    enabled,
  }: {
    unreadOnly: boolean;
    enabled: boolean;
  }) => {
    return useQuery({
      queryKey: notificationKeys.list(unreadOnly),
      queryFn: () => notificationsApi.list({ unreadOnly }),
      enabled,
      staleTime: 30_000,
    });
  },
  useLiveUpdates: ({
    onNotification,
  }: {
    onNotification?: (notification: Notification) => void;
  } = {}) => {
    const socket = useSocket();
    const queryClient = useQueryClient();
    useEffect(() => {
      const handler = (notification: Notification) => {
        queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        onNotification?.(notification);
      };
      socket.on(WebsocketClientEvent.NOTIFICATION_CREATED, handler);
      return () => {
        socket.off(WebsocketClientEvent.NOTIFICATION_CREATED, handler);
      };
    }, [socket, queryClient, onNotification]);
  },
  useMarkRead: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => notificationsApi.markRead(id),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    });
  },
  useMarkAllRead: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => notificationsApi.markAllRead(),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    });
  },
};
