import { useCallback, useMemo, useRef } from 'react';

export function useSubmitLock() {
  const lockedRef = useRef(false);
  const acquire = useCallback(() => {
    if (lockedRef.current) {
      return false;
    }
    lockedRef.current = true;
    return true;
  }, []);
  const release = useCallback(() => {
    lockedRef.current = false;
  }, []);
  const runExclusive = useCallback(
    async <T>(task: () => Promise<T>): Promise<T | undefined> => {
      if (!acquire()) {
        return undefined;
      }
      try {
        return await task();
      } finally {
        release();
      }
    },
    [acquire, release],
  );
  return useMemo(
    () => ({ acquire, release, runExclusive }),
    [acquire, release, runExclusive],
  );
}
