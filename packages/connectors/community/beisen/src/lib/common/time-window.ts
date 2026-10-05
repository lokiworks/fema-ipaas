import { HttpMethod } from '@fema-ipaas/connector-common';

import { beisenCommon, BeisenAuthValue } from './index';

function segments({ startMs, stopMs }: { startMs: number; stopMs: number }): TimeSegment[] {
  if (stopMs <= startMs) {
    return [{ startMs, stopMs }];
  }
  const edges = Array.from(
    { length: Math.ceil((stopMs - startMs) / MAX_SEGMENT_MS) },
    (_, index) => startMs + index * MAX_SEGMENT_MS,
  );
  return edges.map((edge, index) => ({
    startMs: edge,
    stopMs: index === edges.length - 1 ? stopMs : edges[index + 1],
  }));
}

function formatTimestamp({ epochMs, timeZone }: { epochMs: number; timeZone: string }): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(new Date(epochMs))
    .replace(' ', 'T');
}

function requestBody({ startTime, stopTime, scope, queryType, capacity, scrollId, columns }: RequestBodyParams): Record<string, unknown> {
  return {
    startTime,
    stopTime,
    timeWindowQueryType: queryType,
    serviceType: [MAIN_SERVICE_TYPE],
    isWithDeleted: false,
    capacity,
    ...SCOPE_PRESETS[scope],
    ...(scrollId ? { scrollId } : {}),
    ...(columns && columns.length > 0 ? { columns } : {}),
  };
}

async function fetchPage({ auth, body, path }: { auth: BeisenAuthValue; body: Record<string, unknown>; path?: string }): Promise<TimeWindowPage> {
  const response = await beisenCommon.callApi<TimeWindowResponse>({
    auth,
    method: HttpMethod.POST,
    path: path ?? TIME_WINDOW_PATH,
    body,
  });
  if (response.code !== undefined && !beisenCommon.isSuccessCode(response.code)) {
    throw beisenCommon.businessError({ code: response.code, message: response.message });
  }
  return { records: response.data ?? [], scrollId: response.scrollId ?? undefined, isLastData: response.isLastData === true };
}

async function drain({ auth, scope, queryType, startMs, stopMs, timeZone, columns }: DrainParams): Promise<Record<string, unknown>[]> {
  const windows = segments({ startMs, stopMs });
  return windows.reduce<Promise<Record<string, unknown>[]>>(async (accPromise, window) => {
    const acc = await accPromise;
    const collected = await drainWindow({ auth, scope, queryType, window, timeZone, columns });
    return [...acc, ...collected];
  }, Promise.resolve([]));
}

async function drainWindow({ auth, scope, queryType, window, timeZone, columns }: DrainWindowParams): Promise<Record<string, unknown>[]> {
  const startTime = formatTimestamp({ epochMs: window.startMs, timeZone });
  const stopTime = formatTimestamp({ epochMs: window.stopMs, timeZone });
  const collected: Record<string, unknown>[] = [];
  let scrollId: string | undefined = undefined;
  for (let page = 0; page < MAX_PAGES_PER_WINDOW; page++) {
    const result: TimeWindowPage = await fetchPage({
      auth,
      body: requestBody({ startTime, stopTime, scope, queryType, capacity: PAGE_SIZE, scrollId, columns }),
    });
    collected.push(...result.records);
    if (result.records.length === 0 || !result.scrollId || result.isLastData) {
      return collected;
    }
    scrollId = result.scrollId;
  }
  throw new Error(
    `Beisen returned more than ${MAX_PAGES_PER_WINDOW * PAGE_SIZE} changed employees between ${startTime} and ${stopTime}; narrow the status scope or poll more often so no change is dropped`,
  );
}

async function scrollAll({ auth, path, body, maxItems }: ScrollAllParams): Promise<Record<string, unknown>[]> {
  const collected: Record<string, unknown>[] = [];
  let scrollId: string | undefined = undefined;
  for (let page = 0; page < MAX_PAGES_PER_WINDOW; page++) {
    const result: TimeWindowPage = await fetchPage({
      auth,
      path,
      body: { ...body, capacity: PAGE_SIZE, ...(scrollId ? { scrollId } : {}) },
    });
    collected.push(...result.records);
    if (collected.length >= maxItems) {
      return collected.slice(0, maxItems);
    }
    if (result.records.length === 0 || !result.scrollId || result.isLastData) {
      return collected;
    }
    scrollId = result.scrollId;
  }
  return collected;
}

export const beisenTimeWindow = {
  segments,
  formatTimestamp,
  requestBody,
  fetchPage,
  drain,
  scrollAll,
  scopePreset,
};

function scopePreset({ scope }: { scope: StatusScope }): Record<string, unknown> {
  return SCOPE_PRESETS[scope];
}

export const TIME_WINDOW_PATH = '/TenantBaseExternal/api/v5/Employee/GetByTimeWindow';

export const STATUS_SCOPE_OPTIONS = [
  { label: 'Active employees (trial and regular)', value: 'ACTIVE' },
  { label: 'Departed employees (leaving already in effect)', value: 'LEFT' },
  { label: 'Upcoming and active (pending onboarding, trial and regular)', value: 'ONBOARDING' },
  { label: 'Every status, including departed', value: 'ALL' },
];

export const QUERY_TYPE_OPTIONS = [
  { label: 'Business changes only (hire, regularization, transfer, edits)', value: 2 },
  { label: 'Any modification, including nightly system updates', value: 1 },
];

const SCOPE_PRESETS: Record<StatusScope, Record<string, unknown>> = {
  ACTIVE: { empStatus: [2, 3, 7], employType: [0, 2], approvalStatuses: [4], isGetLatestRecord: false },
  LEFT: { empStatus: [8], employType: [0, 2], approvalStatuses: [4], isGetLatestRecord: false },
  ONBOARDING: { empStatus: [1, 2, 3, 7], employType: [0, 2], approvalStatuses: [4], isGetLatestRecord: true },
  ALL: { withDisabled: true, employType: [0, 2], approvalStatuses: [4], isGetLatestRecord: false },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_SEGMENT_MS = 89 * DAY_MS;

const MAIN_SERVICE_TYPE = 0;

const PAGE_SIZE = 300;

const MAX_PAGES_PER_WINDOW = 100;

export type StatusScope = 'ACTIVE' | 'LEFT' | 'ONBOARDING' | 'ALL';

export type TimeSegment = { startMs: number; stopMs: number };

type TimeWindowResponse = {
  code?: number | string;
  message?: string;
  total?: number;
  scrollId?: string | null;
  isLastData?: boolean | null;
  data?: Record<string, unknown>[];
};

type TimeWindowPage = { records: Record<string, unknown>[]; scrollId: string | undefined; isLastData: boolean };

type RequestBodyParams = {
  startTime: string;
  stopTime: string;
  scope: StatusScope;
  queryType: number;
  capacity: number;
  scrollId?: string | undefined;
  columns?: string[] | undefined;
};

type ScrollAllParams = {
  auth: BeisenAuthValue;
  path: string;
  body: Record<string, unknown>;
  maxItems: number;
};

type DrainParams = {
  auth: BeisenAuthValue;
  scope: StatusScope;
  queryType: number;
  startMs: number;
  stopMs: number;
  timeZone: string;
  columns?: string[] | undefined;
};

type DrainWindowParams = {
  auth: BeisenAuthValue;
  scope: StatusScope;
  queryType: number;
  window: TimeSegment;
  timeZone: string;
  columns?: string[] | undefined;
};
