/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { useSubmitLock } from '@/hooks/use-submit-lock';

type Lock = ReturnType<typeof useSubmitLock>;

function mountLock(): { lock: Lock; unmount: () => void } {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const holder: { lock: Lock | null } = { lock: null };
  function Probe() {
    holder.lock = useSubmitLock();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  if (holder.lock === null) {
    throw new Error('hook did not render');
  }
  return { lock: holder.lock, unmount: () => act(() => root.unmount()) };
}

describe('useSubmitLock', () => {
  it('lets only the first of two synchronous submits through', () => {
    const { lock, unmount } = mountLock();
    expect(lock.acquire()).toBe(true);
    expect(lock.acquire()).toBe(false);
    unmount();
  });

  it('accepts a new submit once released, for example after a failed request', () => {
    const { lock, unmount } = mountLock();
    lock.acquire();
    lock.release();
    expect(lock.acquire()).toBe(true);
    unmount();
  });

  it('runs a task once when started twice in the same tick, then frees the lock', async () => {
    const { lock, unmount } = mountLock();
    let runs = 0;
    const task = async () => {
      runs += 1;
      return runs;
    };
    const [first, second] = await Promise.all([
      lock.runExclusive(task),
      lock.runExclusive(task),
    ]);
    expect(runs).toBe(1);
    expect(first).toBe(1);
    expect(second).toBeUndefined();
    expect(await lock.runExclusive(task)).toBe(2);
    unmount();
  });

  it('frees the lock when the task throws', async () => {
    const { lock, unmount } = mountLock();
    await expect(
      lock.runExclusive(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(lock.acquire()).toBe(true);
    unmount();
  });
});
