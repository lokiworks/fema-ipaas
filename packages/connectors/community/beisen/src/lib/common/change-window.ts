import { createHash } from 'node:crypto';

export const beisenChangeWindow = {
  startFor,
  dedupe,
  hashOf,
  sortByChangeTime,
};

function startFor({ lastFetchEpochMS, enabledAtEpochMS, initialLookbackMs }: StartForParams): number {
  if (lastFetchEpochMS === 0) {
    return Date.now() - initialLookbackMs;
  }
  const overlapped = lastFetchEpochMS - OVERLAP_MS;
  return enabledAtEpochMS === undefined ? overlapped : Math.max(overlapped, enabledAtEpochMS);
}

function dedupe({ records, seen, stopMs, startMs }: DedupeParams): DedupeResult {
  const kept = Object.fromEntries(Object.entries(seen).filter(([, seenAtMs]) => seenAtMs >= startMs - OVERLAP_MS));
  const fresh = records.filter((record) => !(hashOf({ record }) in kept));
  const added = Object.fromEntries(fresh.map((record) => [hashOf({ record }), stopMs]));
  return { fresh, seen: { ...kept, ...added } };
}

function sortByChangeTime({ records }: { records: Record<string, unknown>[] }): Record<string, unknown>[] {
  return records
    .map((record, index) => ({ record, index, changedAtMs: changeTimeOf({ record }) }))
    .sort((a, b) => a.changedAtMs - b.changedAtMs || a.index - b.index)
    .map(({ record }) => record);
}

function changeTimeOf({ record }: { record: Record<string, unknown> }): number {
  const stamps = [readStamp({ source: record['recordInfo'] }), readStamp({ source: record['employeeInfo'] })];
  const parsed = stamps.map((stamp) => Date.parse(stamp.replace(' ', 'T'))).find((ms) => Number.isFinite(ms));
  return parsed ?? 0;
}

function readStamp({ source }: { source: unknown }): string {
  if (typeof source !== 'object' || source === null || !('modifiedTime' in source)) {
    return '';
  }
  const value = Reflect.get(source, 'modifiedTime');
  return typeof value === 'string' ? value : '';
}

function hashOf({ record }: { record: Record<string, unknown> }): string {
  return createHash('sha1').update(JSON.stringify(record)).digest('hex');
}

export const OVERLAP_MS = 5 * 60 * 1000;

export type SeenRecords = Record<string, number>;

type StartForParams = {
  lastFetchEpochMS: number;
  enabledAtEpochMS: number | undefined;
  initialLookbackMs: number;
};

type DedupeParams = {
  records: Record<string, unknown>[];
  seen: SeenRecords;
  stopMs: number;
  startMs: number;
};

type DedupeResult = {
  fresh: Record<string, unknown>[];
  seen: SeenRecords;
};
