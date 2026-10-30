import {
  ApplicationEvent,
  ApplicationEventName,
  TENANT_ACCESS_LIMITS,
} from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { Download, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ConsolePage } from '@/components/custom/console-page';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  const [searchParams] = useSearchParams();
  const [action, setAction] = useState<ApplicationEventName | 'any'>(() =>
    actionFromParam(searchParams.get('action')),
  );
  const [projectId, setProjectId] = useState<string>('any');
  const [cursors, setCursors] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const { data: membersData } = tenantAccessHooks.useMembers();
  const { data: projects } = projectCollectionUtils.useAllTenantProjects();
  const createdAfter = useMemo(() => rangeStart(range), [range]);
  const filters = {
    action: action === 'any' ? undefined : [action],
    userId: userId ?? undefined,
    projectId: projectId === 'any' ? undefined : [projectId],
    createdAfter,
  };
  const cursor = cursors[cursors.length - 1];
  const { data, isLoading } = auditEventsHooks.useAuditEvents({
    ...filters,
    cursor,
  });
  const resetPaging = () => setCursors([]);
  const projectNameById = useMemo(
    () =>
      new Map(
        (projects ?? []).map((project) => [project.id, project.displayName]),
      ),
    [projects],
  );
  const projectIdsNeedingNames = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.data ?? [])
            .filter(auditEventUtils.needsWorkflowName)
            .flatMap((event) =>
              event.projectId && projectNameById.has(event.projectId)
                ? [event.projectId]
                : [],
            ),
        ),
      ),
    [data?.data, projectNameById],
  );
  const fetchedWorkflowNames = auditEventsHooks.useWorkflowNames({
    projectIds: projectIdsNeedingNames,
  });
  const workflowNames = useMemo(
    () => ({
      ...auditEventUtils.learnWorkflowNames({ events: data?.data ?? [] }),
      ...fetchedWorkflowNames,
    }),
    [data?.data, fetchedWorkflowNames],
  );
  const userNames = useMemo(
    () =>
      Object.fromEntries(
        (membersData?.members ?? []).map((member) => [
          member.id,
          tenantAccessUtils.memberDisplayName(member),
        ]),
      ),
    [membersData?.members],
  );

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await collectAll(filters);
      const csv = tenantAccessUtils.toCsv([
        [
          t('Time'),
          t('Actor'),
          t('Action'),
          t('Audit target'),
          t('Project'),
          'IP',
        ],
        ...rows.map((event) => [
          dayjs(event.created).format('YYYY-MM-DD HH:mm:ss'),
          event.userEmail ?? '',
          auditEventUtils.eventActionLabel(event),
          auditEventUtils.summarize({ event, workflowNames, userNames }),
          projectLabelOf({ event, projectNameById }),
          event.ip ? displayIp(event.ip) : '',
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
    <ConsolePage
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
          <Table className="table-fixed md:min-w-[40rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-24 md:w-28 xl:w-40">
                  {t('Time')}
                </TableHead>
                <TableHead className="w-20 md:w-24 xl:w-40">
                  {t('Actor')}
                </TableHead>
                <TableHead className="md:w-28 xl:w-36">{t('Action')}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t('Audit target')}
                </TableHead>
                <TableHead className="hidden w-36 md:table-cell xl:w-44">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-default items-center gap-1">
                        {t('Project')}
                        <Info className="size-3.5 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t(
                        'Events that do not belong to any project, such as failed sign-ins and tenant settings, show as "Platform-level".',
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="hidden w-32 xl:table-cell">IP</TableHead>
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
                <AuditRow
                  key={event.id}
                  event={event}
                  workflowNames={workflowNames}
                  userNames={userNames}
                  projectNameById={projectNameById}
                />
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
            {t('Previous page')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.next}
            onClick={() => data?.next && setCursors([...cursors, data.next])}
          >
            {t('Next page')}
          </Button>
        </div>
      </div>
    </ConsolePage>
  );
}

function AuditRow({
  event,
  workflowNames,
  userNames,
  projectNameById,
}: {
  event: ApplicationEvent;
  workflowNames: Record<string, string>;
  userNames: Record<string, string>;
  projectNameById: Map<string, string>;
}) {
  const summary = auditEventUtils.summarize({
    event,
    workflowNames,
    userNames,
  });
  const projectLabel = projectLabelOf({ event, projectNameById });
  const actorName =
    (event.userId ? userNames[event.userId] : undefined) ??
    event.userEmail ??
    '—';
  const runId = auditEventUtils.runIdOf(event);
  const runPath =
    runId && event.projectId
      ? `/projects/${event.projectId}/runs/${runId}`
      : null;
  return (
    <TableRow>
      <TableCell className="truncate whitespace-nowrap">
        <FormattedDate date={new Date(event.created)} />
      </TableCell>
      <TableCell className="min-w-0">
        {event.userEmail && event.userEmail !== actorName ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="truncate">{actorName}</p>
            </TooltipTrigger>
            <TooltipContent>{event.userEmail}</TooltipContent>
          </Tooltip>
        ) : (
          <TextWithTooltip tooltipMessage={actorName}>
            <p className="truncate">{actorName}</p>
          </TextWithTooltip>
        )}
      </TableCell>
      <TableCell className="min-w-0">
        <p className="truncate whitespace-nowrap">
          {auditEventUtils.eventActionLabel(event)}
        </p>
        <div
          className="flex flex-col gap-0.5 pt-1 text-xs md:hidden"
          data-testid="audit-row-compact-target"
        >
          {runPath ? (
            <Link
              to={runPath}
              className="break-words text-primary hover:underline"
            >
              {summary}
            </Link>
          ) : (
            <p className="break-words text-muted-foreground">{summary}</p>
          )}
          <p className="truncate text-muted-foreground">{projectLabel}</p>
        </div>
      </TableCell>
      <TableCell className="hidden min-w-0 md:table-cell">
        <TextWithTooltip tooltipMessage={summary}>
          {runPath ? (
            <Link
              to={runPath}
              className="block truncate text-primary hover:underline"
            >
              {summary}
            </Link>
          ) : (
            <p className="truncate text-muted-foreground">{summary}</p>
          )}
        </TextWithTooltip>
      </TableCell>
      <TableCell className="hidden min-w-0 text-muted-foreground md:table-cell">
        <TextWithTooltip tooltipMessage={projectLabel}>
          <p className="truncate whitespace-nowrap">{projectLabel}</p>
        </TextWithTooltip>
        <p className="truncate font-mono text-xs xl:hidden">
          {displayIp(event.ip)}
        </p>
      </TableCell>
      <TableCell className="hidden font-mono text-xs text-muted-foreground xl:table-cell">
        {displayIp(event.ip)}
      </TableCell>
    </TableRow>
  );
}

function projectLabelOf({
  event,
  projectNameById,
}: {
  event: ApplicationEvent;
  projectNameById: Map<string, string>;
}): string {
  if (auditEventUtils.isPlatformLevel(event.action)) {
    return t('Platform-level');
  }
  if (event.projectDisplayName) {
    return event.projectDisplayName;
  }
  if (event.projectId) {
    return projectNameById.get(event.projectId) ?? t('Deleted project');
  }
  return t('Platform-level');
}

function displayIp(ip: string | null | undefined): string {
  return ip ? ip.replace(/^::ffff:/, '') : '—';
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

function actionFromParam(value: string | null): ApplicationEventName | 'any' {
  return (
    Object.values(ApplicationEventName).find((name) => name === value) ?? 'any'
  );
}

type RangeKey = '1h' | '24h' | '7d' | '30d' | '90d';
