import {
  DefaultProjectRole,
  ExecutionStatus,
  FAILED_STATES,
  HOME_HOURS_PER_DAY,
  ProjectDirectoryItem,
} from '@fema-ipaas/shared';

import { RecentVisit } from '@/lib/recent-visits';

function greetingKey(hour: number): string {
  if (hour < 6) {
    return 'It is late at night';
  }
  if (hour < 11) {
    return 'Good morning';
  }
  if (hour < 13) {
    return 'Good noon';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

function localMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function successRate({
  succeeded,
  finished,
}: {
  succeeded: number;
  finished: number;
}): number | null {
  if (finished <= 0) {
    return null;
  }
  return succeeded / finished;
}

function formatRate(rate: number | null): string {
  if (rate === null) {
    return '-';
  }
  const percent = Math.round(rate * 1000) / 10;
  return `${percent}%`;
}

function visibleHourly({
  hourly,
  since,
  now,
}: {
  hourly: number[];
  since: Date;
  now: Date;
}): number[] {
  const elapsedHours =
    Math.floor((now.getTime() - since.getTime()) / MS_PER_HOUR) + 1;
  const count = Math.min(
    HOME_HOURS_PER_DAY,
    Math.max(MIN_VISIBLE_HOURS, elapsedHours),
  );
  return Array.from({ length: count }, (_, hour) => hourly[hour] ?? 0);
}

function visibleRecentVisits({
  visits,
  memberProjectIds,
  limit,
}: {
  visits: RecentVisit[];
  memberProjectIds: string[];
  limit: number;
}): RecentVisit[] {
  return [...visits]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .filter((visit) => memberProjectIds.includes(visit.projectId))
    .slice(0, limit);
}

function recentVisitHref(
  visit: Pick<RecentVisit, 'type' | 'id' | 'projectId'>,
): string {
  if (visit.type === 'dataStore') {
    return `/projects/${visit.projectId}/data-stores?${new URLSearchParams({
      id: visit.id,
    }).toString()}`;
  }
  return `/projects/${visit.projectId}/workflows/${visit.id}`;
}

function runsHref({
  projectId,
  since,
  failedOnly,
}: {
  projectId: string;
  since: string;
  failedOnly: boolean;
}): string {
  const params = new URLSearchParams();
  if (failedOnly) {
    HOME_FAILED_STATUSES.forEach((status) => params.append('status', status));
  }
  params.set('createdAfter', since);
  return `/projects/${projectId}/runs?${params.toString()}`;
}

function roleLabelKey(role: DefaultProjectRole | null | undefined): string {
  switch (role) {
    case DefaultProjectRole.ADMIN:
      return 'Owner';
    case DefaultProjectRole.DEVELOPER:
      return 'Can edit';
    case DefaultProjectRole.OPERATOR:
      return 'On call';
    case DefaultProjectRole.VIEWER:
      return 'Can view';
    default:
      return 'No access';
  }
}

function pickTargetProject({
  projects,
  currentProjectId,
  canCreate,
}: {
  projects: ProjectDirectoryItem[];
  currentProjectId: string | null;
  canCreate: (item: ProjectDirectoryItem) => boolean;
}): ProjectDirectoryItem | null {
  const creatable = projects.filter(canCreate);
  return (
    creatable.find((project) => project.id === currentProjectId) ??
    creatable[0] ??
    null
  );
}

function nextBatch({
  total,
  batch,
  size,
}: {
  total: number;
  batch: number;
  size: number;
}): number[] {
  if (total <= 0) {
    return [];
  }
  return Array.from(
    { length: Math.min(size, total) },
    (_, index) => (batch * size + index) % total,
  );
}

const MS_PER_HOUR = 60 * 60 * 1000;
const HOME_FAILED_STATUSES: ExecutionStatus[] = [
  ...FAILED_STATES,
  ExecutionStatus.LOG_SIZE_EXCEEDED,
];
const MIN_VISIBLE_HOURS = 2;

export const homeUtils = {
  greetingKey,
  localMidnight,
  successRate,
  formatRate,
  visibleHourly,
  visibleRecentVisits,
  recentVisitHref,
  runsHref,
  roleLabelKey,
  pickTargetProject,
  nextBatch,
};

export const HOME_RECENT_LIMIT = 6;
export const HOME_TEMPLATE_BATCH_SIZE = 4;
export const HOME_AI_PROMPT_MAX_LENGTH = 500;
