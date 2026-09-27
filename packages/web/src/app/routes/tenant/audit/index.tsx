import {
  ApplicationEvent,
  ApplicationEventName,
  TENANT_ACCESS_LIMITS,
} from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { CenteredPage } from '@/app/components/centered-page';
import { FormattedDate } from '@/components/custom/formatted-date';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  auditEventsApi,
  auditEventsHooks,
  auditEventUtils,
} from '@/features/audit-events';
import { projectCollectionUtils } from '@/features/projects';
import {
  MemberPicker,
  tenantAccessApi,
  tenantAccessHooks,
  tenantAccessUtils,
} from '@/features/tenant-access';
import { downloadFile } from '@/lib/dom-utils';

export default function AuditLogPage() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [userId, setUserId] = useState<string | null>(null);
  const [action, setAction] = useState<ApplicationEventName | 'any'>('any');
  const [projectId, setProjectId] = useState<string>('any');
  const [cursors, setCursors] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const { data: membersData } = tenantAccessHooks.useMembers();
  const { data: projects } = projectCollectionUtils.useAllTenantProjects();
  const filters = {
    action: action === 'any' ? undefined : [action],
    userId: userId ?? undefined,
    projectId: projectId === 'any' ? undefined : [projectId],
    createdAfter: rangeStart(range),
  };
  const cursor = cursors[cursors.length - 1];
  const { data, isLoading } = auditEventsHooks.useAuditEvents({
    ...filters,
    cursor,
  });
  const resetPaging = () => setCursors([]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await collectAll(filters);
      const csv = tenantAccessUtils.toCsv([
        [t('Time'), t('Actor'), t('Action'), t('Target'), t('Project'), 'IP'],
        ...rows.map((event) => [
          dayjs(event.created).format('YYYY-MM-DD HH:mm:ss'),
          event.userEmail ?? '',
          auditEventUtils.actionLabel(event.action),
          auditEventUtils.summarize(event),
          event.projectDisplayName ?? t('Platform'),
          event.ip ?? '',
        ]),
      ]);
      await downloadFile({
        obj: csv,
        fileName: `audit-log-${dayjs().format('YYYYMMDD-HHmm')}`,
        extension: 'csv',
      });
      await tenantAccessApi.recordAuditExport(rows.length);
      toast.success(t('exportedRowsCount', { count: rows.length }));
    } catch {
      toast.error(t('Something went wrong'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <CenteredPage
      widthClassName="max-w-[72rem]"
      title={t('Audit Log')}
      description={t(
        'Key actions taken on the platform. Records are kept for 90 days.',
      )}
      actions={
        <Button variant="outline" loading={exporting} onClick={exportCsv}>
          <Download className="size-4" />
          {t('Export CSV')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={range}
            onValueChange={(value) => {
              setRange(RANGE_KEYS.find((key) => key === value) ?? '30d');
              resetPaging();
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {rangeLabel(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="w-56">
            <MemberPicker
              members={membersData?.members ?? []}
              value={userId}
              onChange={(value) => {
                setUserId(value);
                resetPaging();
              }}
              excludeIds={[]}
              placeholder={t('Any actor')}
            />
          </div>
          <Select
            value={action}
            onValueChange={(value) => {
              setAction(
                Object.values(ApplicationEventName).find(
                  (name) => name === value,
                ) ?? 'any',
              );
              resetPaging();
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('Any action')}</SelectItem>
              {Object.values(ApplicationEventName).map((name) => (
                <SelectItem key={name} value={name}>
                  {auditEventUtils.actionLabel(name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={projectId}
            onValueChange={(value) => {
              setProjectId(value);
              resetPaging();
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('Any project')}</SelectItem>
              {(projects ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">{t('Time')}</TableHead>
                <TableHead className="w-48">{t('Actor')}</TableHead>
                <TableHead className="w-44">{t('Action')}</TableHead>
                <TableHead>{t('Target')}</TableHead>
                <TableHead className="w-36">{t('Project')}</TableHead>
                <TableHead className="w-32">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    {t('No audit events match these filters')}
                  </TableCell>
                </TableRow>
              )}
              {(data?.data ?? []).map((event) => (
                <AuditRow key={event.id} event={event} />
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={cursors.length === 0}
            onClick={() => setCursors(cursors.slice(0, -1))}
          >
            {t('Previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.next}
            onClick={() => data?.next && setCursors([...cursors, data.next])}
          >
            {t('Next')}
          </Button>
        </div>
      </div>
    </CenteredPage>
  );
}

function AuditRow({ event }: { event: ApplicationEvent }) {
  const summary = auditEventUtils.summarize(event);
  return (
    <TableRow>
      <TableCell>
        <FormattedDate date={new Date(event.created)} />
      </TableCell>
      <TableCell className="max-w-48">
        <TextWithTooltip tooltipMessage={event.userEmail ?? ''}>
          <p className="truncate">{event.userEmail ?? '—'}</p>
        </TextWithTooltip>
      </TableCell>
      <TableCell>{auditEventUtils.actionLabel(event.action)}</TableCell>
      <TableCell className="max-w-[28rem]">
        <TextWithTooltip tooltipMessage={summary}>
          <p className="truncate text-muted-foreground">{summary}</p>
        </TextWithTooltip>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {event.projectDisplayName ?? t('Platform')}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {event.ip ?? '—'}
      </TableCell>
    </TableRow>
  );
}

async function collectAll(filters: {
  action?: string[];
  userId?: string;
  projectId?: string[];
  createdAfter: string;
}): Promise<ApplicationEvent[]> {
  const pages: ApplicationEvent[][] = [];
  let cursor: string | undefined = undefined;
  for (let page = 0; page < EXPORT_MAX_PAGES; page++) {
    const result = await auditEventsApi.list({
      ...filters,
      cursor,
      limit: EXPORT_PAGE_SIZE,
    });
    pages.push(result.data);
    if (!result.next) {
      break;
    }
    cursor = result.next;
  }
  return pages.flat();
}

function rangeStart(range: RangeKey): string {
  const [amount, unit] = RANGES[range];
  return dayjs().subtract(amount, unit).toISOString();
}

function rangeLabel(range: RangeKey): string {
  switch (range) {
    case '1h':
      return t('Last hour');
    case '24h':
      return t('Last 24 hours');
    case '7d':
      return t('Last 7 days');
    case '30d':
      return t('Last 30 days');
    case '90d':
      return t('Last 90 days');
  }
}

const RANGE_KEYS: RangeKey[] = ['1h', '24h', '7d', '30d', '90d'];

const RANGES: Record<RangeKey, [number, 'hour' | 'day']> = {
  '1h': [1, 'hour'],
  '24h': [24, 'hour'],
  '7d': [7, 'day'],
  '30d': [30, 'day'],
  '90d': [TENANT_ACCESS_LIMITS.auditRetentionDays, 'day'],
};

const EXPORT_PAGE_SIZE = 500;
const EXPORT_MAX_PAGES = 40;

type RangeKey = '1h' | '24h' | '7d' | '30d' | '90d';
