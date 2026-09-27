import { TourId, TourStep } from '../lib/tours';

function selector(target: string): string {
  return `[data-tour="${target}"]`;
}

function resolveSteps({
  steps,
  isVisible,
}: {
  steps: TourStep[];
  isVisible: (target: string) => boolean;
}): ResolvedTourStep[] {
  return steps.flatMap((step) => {
    const target = step.targets.find(isVisible);
    return target === undefined ? [] : [{ ...step, target }];
  });
}

function readProgress({
  storage,
  userId,
}: {
  storage: TourStorage;
  userId: string;
}): TourProgress {
  try {
    const raw = storage.getItem(storageKey(userId));
    if (raw === null) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    return isProgress(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeProgress({
  storage,
  userId,
  tourId,
  status,
}: {
  storage: TourStorage;
  userId: string;
  tourId: TourId;
  status: TourStatus;
}): TourProgress {
  const next = { ...readProgress({ storage, userId }), [tourId]: status };
  try {
    storage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
}

function cardPosition({
  rect,
  viewport,
  card,
}: {
  rect: Rect | null;
  viewport: { width: number; height: number };
  card: { width: number; height: number };
}): { left: number; top: number } {
  if (rect === null) {
    return {
      left: viewport.width / 2 - card.width / 2,
      top: viewport.height / 2 - card.height / 2,
    };
  }
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const candidate =
    right + GAP + card.width < viewport.width - MARGIN
      ? { left: right + GAP, top: rect.top }
      : rect.left - GAP - card.width > MARGIN
      ? { left: rect.left - GAP - card.width, top: rect.top }
      : bottom + GAP + card.height < viewport.height - MARGIN
      ? { left: rect.left, top: bottom + GAP }
      : { left: rect.left, top: rect.top - GAP - card.height };
  return {
    left: clamp({
      value: candidate.left,
      min: MARGIN,
      max: viewport.width - card.width - MARGIN,
    }),
    top: clamp({
      value: candidate.top,
      min: MARGIN,
      max: viewport.height - card.height - MARGIN,
    }),
  };
}

function clamp({
  value,
  min,
  max,
}: {
  value: number;
  min: number;
  max: number;
}): number {
  return Math.max(min, Math.min(value, max));
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function isProgress(value: unknown): value is TourProgress {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (status) => status === 'completed' || status === 'dismissed',
    )
  );
}

export const tourUtils = {
  selector,
  resolveSteps,
  readProgress,
  writeProgress,
  cardPosition,
};

const STORAGE_PREFIX = 'tour-progress:';
const GAP = 16;
const MARGIN = 8;

export type TourStatus = 'completed' | 'dismissed';
export type TourProgress = Partial<Record<TourId, TourStatus>>;
export type ResolvedTourStep = TourStep & { target: string };
export type TourStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type Rect = { left: number; top: number; width: number; height: number };
