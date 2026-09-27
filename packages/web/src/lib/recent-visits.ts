import { authenticationSession } from './authentication-session';

function storageKey(): string | null {
  const userId = authenticationSession.getCurrentUserId();
  return userId ? `${STORAGE_PREFIX}${userId}` : null;
}

function isRecentVisit(value: unknown): value is RecentVisit {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record: Record<string, unknown> = { ...value };
  return (
    (record.type === 'workflow' || record.type === 'dataStore') &&
    typeof record.id === 'string' &&
    typeof record.projectId === 'string' &&
    typeof record.name === 'string' &&
    typeof record.visitedAt === 'number'
  );
}

function readAll(): RecentVisit[] {
  const key = storageKey();
  if (!key) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentVisit) : [];
  } catch {
    return [];
  }
}

function writeAll(visits: RecentVisit[]): void {
  const key = storageKey();
  if (!key) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(visits));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    return;
  }
}

function record(visit: Omit<RecentVisit, 'visitedAt'>): void {
  const others = readAll().filter(
    (item) => !(item.type === visit.type && item.id === visit.id),
  );
  writeAll(
    [{ ...visit, visitedAt: Date.now() }, ...others].slice(0, MAX_STORED),
  );
}

function remove({ type, id }: Pick<RecentVisit, 'type' | 'id'>): void {
  writeAll(readAll().filter((item) => !(item.type === type && item.id === id)));
}

function list(): RecentVisit[] {
  return [...readAll()].sort((a, b) => b.visitedAt - a.visitedAt);
}

const MAX_STORED = 30;
const STORAGE_PREFIX = 'recent-visits:';
const CHANGE_EVENT = 'recent-visits-changed';

export const recentVisits = {
  record,
  remove,
  list,
  changeEvent: CHANGE_EVENT,
};

export type RecentVisitType = 'workflow' | 'dataStore';

export type RecentVisit = {
  type: RecentVisitType;
  id: string;
  projectId: string;
  name: string;
  visitedAt: number;
};
