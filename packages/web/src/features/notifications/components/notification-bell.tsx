import { isNil } from '@fema-ipaas/core-utils';
import { Notification } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Bell, BellOff } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { MessageTooltip } from '@/components/custom/message-tooltip';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar-shadcn';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { connectorsHooks } from '@/features/connectors';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { notificationsHooks } from '../hooks/notifications-hooks';
import { notificationUiUtils } from '../utils/notification-ui-utils';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotificationTab>('all');
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const { data: unread } = notificationsHooks.useUnreadCount();
  const { data: page, isLoading } = notificationsHooks.useList({
    unreadOnly: tab === 'unread',
    enabled: open,
  });
  const markRead = notificationsHooks.useMarkRead();
  const markAllRead = notificationsHooks.useMarkAllRead();
  const onNotification = useCallback((notification: Notification) => {
    toast(notificationUiUtils.headline(notification), {
      description: notificationUiUtils.subject(notification),
    });
  }, []);
  notificationsHooks.useLiveUpdates({ onNotification });
  const unreadCount = unread?.count ?? 0;
  const items = page?.data ?? [];

  const openNotification = (notification: Notification) => {
    if (!notification.read) {
      markRead.mutate(notification.id);
    }
    if (!isNil(notification.link)) {
      setOpen(false);
      navigate(notification.link);
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton
              aria-label={
                unreadCount > 0
                  ? t('Notifications, {count} unread', { count: unreadCount })
                  : t('Notifications')
              }
              className="relative"
            >
              <Bell className="size-4" />
              {!isCollapsed && (
                <span className="text-sm">{t('Notifications')}</span>
              )}
              {unreadCount > 0 && (
                <span
                  className={cn(
                    'flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white',
                    isCollapsed ? 'absolute right-0.5 top-0.5' : 'ml-auto',
                  )}
                >
                  {notificationUiUtils.badgeLabel(unreadCount)}
                </span>
              )}
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="end"
            sideOffset={10}
            className="w-[380px] p-0"
          >
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <span className="text-sm font-semibold">
                {t('Notifications')}
              </span>
              <Tabs
                value={tab}
                onValueChange={(value) =>
                  setTab(value === 'unread' ? 'unread' : 'all')
                }
                className="ml-2"
              >
                <TabsList>
                  <TabsTrigger value="all">{t('All')}</TabsTrigger>
                  <TabsTrigger value="unread">{t('Unread')}</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="ml-auto">
                <MessageTooltip
                  isDisabled={unreadCount === 0}
                  message="There are no unread notifications"
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={unreadCount === 0 || markAllRead.isPending}
                    onClick={() => markAllRead.mutate()}
                  >
                    {t('Mark all as read')}
                  </Button>
                </MessageTooltip>
              </div>
            </div>
            <ScrollArea className="max-h-[420px]">
              {isLoading ? (
                <div className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-start gap-2 px-4 py-8">
                  <BellOff className="size-6 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {tab === 'unread'
                      ? t('No unread notifications')
                      : t('No notifications yet')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(
                      'Approvals, agent confirmations and edit takeovers show up here.',
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col py-1">
                  {items.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onOpen={() => openNotification(notification)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: () => void;
}) {
  const { icon: Icon, className } = notificationUiUtils.icon(notification.type);
  const subject = notificationUiUtils.subject(notification);
  const { summary } = connectorsHooks.useConnectorSummary({
    name: notification.body ?? '',
  });
  const body = notificationUiUtils.bodyText({
    notification,
    connectorDisplayName: summary?.displayName,
  });
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-accent',
        !notification.read && 'bg-primary/5',
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', className)} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">
          {notificationUiUtils.headline(notification)}
        </span>
        {subject.length > 0 && (
          <span className="truncate text-xs text-foreground/80">{subject}</span>
        )}
        {!isNil(body) && (
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {body}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">
          {formatUtils.formatDate(new Date(notification.created))}
        </span>
      </span>
      {!notification.read && (
        <span
          aria-label={t('Unread')}
          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
        />
      )}
    </button>
  );
}

type NotificationTab = 'all' | 'unread';
