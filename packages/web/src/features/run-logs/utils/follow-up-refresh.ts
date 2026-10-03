function scheduleFollowUps({
  refresh,
  delaysMs = FOLLOW_UP_DELAYS_MS,
}: {
  refresh: () => void;
  delaysMs?: number[];
}): () => void {
  const timers = delaysMs.map((delay) => setTimeout(refresh, delay));
  return () => timers.forEach((timer) => clearTimeout(timer));
}

export const followUpRefresh = { scheduleFollowUps };

const FOLLOW_UP_DELAYS_MS = [1500, 4000, 9000];
