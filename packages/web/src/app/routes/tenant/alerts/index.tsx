import {
  AlertPolicy,
  AlertRecordStatus,
  NotificationChannel,
  NotificationChannelStatus,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { BellRing, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { alertsHooks, alertUiUtils } from '@/features/alerts';
import { issueUiUtils } from '@/features/issues';

import { ChannelDialog } from './channel-dialog';
import { PolicyDialog } from './policy-dialog';

export function AlertSettings() {
  return (
    <Tabs defaultValue="policies">
      <TabsList>
        <TabsTrigger value="policies">{t('Alert policies')}</TabsTrigger>
        <TabsTrigger value="channels">{t('Notification channels')}</TabsTrigger>
        <TabsTrigger value="records">{t('Alert history')}</TabsTrigger>
      </TabsList>
      <TabsContent value="policies">
        <PoliciesTab />
      </TabsContent>
      <TabsContent value="channels">
        <ChannelsTab />
      </TabsContent>
      <TabsContent value="records">
        <RecordsTab />
      </TabsContent>
    </Tabs>
  );
}

function PoliciesTab() {
  const { data: policies, isLoading } = alertsHooks.usePolicies();
  const { data: channels } = alertsHooks.useChannels();
  const { mutateAsync: deletePolicy } = alertsHooks.useDeletePolicy();
  const [editing, setEditing] = useState<AlertPolicy | null>(null);
  const [open, setOpen] = useState(false);
  const channelName = (id: string) =>
    channels?.find((channel) => channel.id === id)?.name ??
    t('Deleted channel');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4 mr-1" />
          {t('New alert policy')}
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Name')}</TableHead>
              <TableHead>{t('Trigger when')}</TableHead>
              <TableHead>{t('Grouping window')}</TableHead>
              <TableHead>{t('Notify')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(policies ?? []).map((policy) => (
              <TableRow key={policy.id}>
                <TableCell className="font-medium">{policy.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {policy.events
                    .map((event) => alertUiUtils.eventLabel(event))
                    .join('、')}
                </TableCell>
                <TableCell>
                  {alertUiUtils.windowLabel(policy.groupWindowMinutes)}
                </TableCell>
                <TableCell className="text-sm">
                  {policy.channelIds.map(channelName).join('、')}
                </TableCell>
                <TableCell>
                  <Badge variant={policy.enabled ? 'success' : 'outline'}>
                    {policy.enabled ? t('Enabled') : t('Disabled')}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('Edit')}
                    onClick={() => {
                      setEditing(policy);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmationDeleteDialog
                    title={t('Delete alert policy')}
                    message={t(
                      'Alerts from this policy stop immediately. The alert history is kept.',
                    )}
                    entityName={policy.name}
                    isDanger
                    mutationFn={async () => {
                      await deletePolicy(policy.id);
                    }}
                  >
                    <Button variant="ghost" size="sm" aria-label={t('Delete')}>
                      <Trash2 className="size-4" />
                    </Button>
                  </ConfirmationDeleteDialog>
                </TableCell>
              </TableRow>
            ))}
            {(policies ?? []).length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-sm text-muted-foreground"
                >
                  {t(
                    'No alert policies yet. Issues still appear in each project, but nobody is notified.',
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      <PolicyDialog
        open={open}
        onOpenChange={setOpen}
        existing={editing}
        channels={channels ?? []}
      />
    </div>
  );
}

function ChannelsTab() {
  const { data: channels, isLoading } = alertsHooks.useChannels();
  const { data: capabilities } = alertsHooks.useCapabilities();
  const { mutate: testChannel, isPending: testing } =
    alertsHooks.useTestChannel();
  const { mutateAsync: deleteChannel } = alertsHooks.useDeleteChannel();
  const [editing, setEditing] = useState<NotificationChannel | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {capabilities?.emailConfigured === false && (
        <p className="text-sm text-muted-foreground">
          {t('Email channels are unavailable until SMTP is configured.')}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4 mr-1" />
          {t('New channel')}
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Name')}</TableHead>
              <TableHead>{t('Type')}</TableHead>
              <TableHead>{t('Target')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Used by')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(channels ?? []).map((channel) => (
              <TableRow key={channel.id}>
                <TableCell className="font-medium">{channel.name}</TableCell>
                <TableCell>
                  {alertUiUtils.channelTypeLabel(channel.type)}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {channel.target}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      channel.status === NotificationChannelStatus.ACTIVE
                        ? 'success'
                        : 'outline'
                    }
                  >
                    {channel.status === NotificationChannelStatus.ACTIVE
                      ? t('Available')
                      : t('Unavailable (SMTP missing)')}
                  </Badge>
                </TableCell>
                <TableCell>
                  {t('{count} policies', { count: channel.usedByPolicies })}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('Send test message')}
                    disabled={testing}
                    onClick={() => testChannel(channel.id)}
                  >
                    <Send className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('Edit')}
                    onClick={() => {
                      setEditing(channel);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmationDeleteDialog
                    title={t('Delete channel')}
                    message={t('The channel stops receiving alerts.')}
                    entityName={channel.name}
                    isDanger
                    mutationFn={async () => {
                      await deleteChannel(channel.id);
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('Delete')}
                      disabled={channel.usedByPolicies > 0}
                      title={
                        channel.usedByPolicies > 0
                          ? t('Remove it from the policies that use it first')
                          : undefined
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </ConfirmationDeleteDialog>
                </TableCell>
              </TableRow>
            ))}
            {(channels ?? []).length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-sm text-muted-foreground"
                >
                  {t(
                    'No channels yet. Add a Feishu, WeCom, DingTalk, Slack, webhook or email channel.',
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      <ChannelDialog open={open} onOpenChange={setOpen} existing={editing} />
    </div>
  );
}

function RecordsTab() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data: stats } = alertsHooks.useRecordStats();
  const { data: page, isLoading } = alertsHooks.useRecords({
    cursor,
    limit: RECORDS_PAGE_SIZE,
  });
  const { data: policies } = alertsHooks.usePolicies();
  const { data: channels } = alertsHooks.useChannels();
  const policyName = (id: string) =>
    policies?.find((policy) => policy.id === id)?.name ?? t('Deleted policy');
  const channelName = (id: string) =>
    channels?.find((channel) => channel.id === id)?.name ??
    t('Deleted channel');
  const averageMerged =
    stats && stats.alertsLast7Days > 0
      ? (stats.mergedFailuresLast7Days / stats.alertsLast7Days).toFixed(1)
      : '0';

  return (
    <div className="flex flex-col gap-3">
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label={t('Alerts in the last 7 days')}
            value={String(stats.alertsLast7Days)}
          />
          <StatCard
            label={t('Failures merged into them')}
            value={String(stats.mergedFailuresLast7Days)}
          />
          <StatCard label={t('Failures per alert')} value={averageMerged} />
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Time')}</TableHead>
              <TableHead>{t('Policy')}</TableHead>
              <TableHead>{t('Alert')}</TableHead>
              <TableHead>{t('Kind')}</TableHead>
              <TableHead>{t('Channels')}</TableHead>
              <TableHead>{t('Merged')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(page?.data ?? []).map((record) => (
              <TableRow key={record.id}>
                <TableCell className="whitespace-nowrap">
                  <FormattedDate
                    date={new Date(record.sentAt ?? record.scheduledAt)}
                  />
                </TableCell>
                <TableCell>{policyName(record.policyId)}</TableCell>
                <TableCell className="max-w-72 truncate" title={record.summary}>
                  {record.summary}
                </TableCell>
                <TableCell>
                  {issueUiUtils.alertKindLabel(record.kind)}
                </TableCell>
                <TableCell className="text-sm">
                  {record.channelIds.map(channelName).join('、')}
                </TableCell>
                <TableCell>{record.mergedCount}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      record.status === AlertRecordStatus.SENT
                        ? 'success'
                        : record.status === AlertRecordStatus.FAILED
                        ? 'destructive'
                        : 'outline'
                    }
                    title={record.error ?? undefined}
                  >
                    {alertUiUtils.recordStatusLabel(record.status)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {(page?.data ?? []).length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-sm text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-2">
                    <BellRing className="size-4" />
                    {t('No alerts have been sent yet.')}
                  </span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={!page?.previous}
          onClick={() => setCursor(page?.previous ?? undefined)}
        >
          {t('Previous')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!page?.next}
          onClick={() => setCursor(page?.next ?? undefined)}
        >
          {t('Next')}
        </Button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
    </div>
  );
}

const RECORDS_PAGE_SIZE = 10;
