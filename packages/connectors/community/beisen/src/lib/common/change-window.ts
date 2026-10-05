import { createHash } from 'node:crypto';

export const beisenChangeWindow = {
  startFor,
  dedupe,
  hashOf,
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
