import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { followUpRefresh } from '@/features/run-logs/utils/follow-up-refresh';

describe('followUpRefresh.scheduleFollowUps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes again shortly after a terminate request, not only after the 15 second poll', () => {
    const refresh = vi.fn();
    followUpRefresh.scheduleFollowUps({ refresh });
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2500);
    expect(refresh).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5000);
    expect(refresh).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(60000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('can be cancelled', () => {
    const refresh = vi.fn();
    const cancel = followUpRefresh.scheduleFollowUps({ refresh });
    cancel();
    vi.advanceTimersByTime(60000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
