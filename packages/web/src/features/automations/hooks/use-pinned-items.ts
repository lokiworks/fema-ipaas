import { t } from 'i18next';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { authenticationSession } from '@/lib/authentication-session';

const STORAGE_KEY_PREFIX = 'ap_pinned_items_';

function getStorageKey(workspaceId: string, userId: string): string {
  return `${STORAGE_KEY_PREFIX}${workspaceId}_${userId}`;
}

/**
 * Stored as an ordered array where index 0 = most recently pinned (shown first).
 * New pins are prepended so "last pinned = very top".
 */
function readPinnedList(workspaceId: string, userId: string): string[] {
  try {
    const raw = localStorage.getItem(getStorageKey(workspaceId, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      typeof parsed[0] === 'object'
    ) {
      return [];
    }
    return parsed as string[];
  } catch {
    return [];
  }
}

function writePinnedList(
  workspaceId: string,
  userId: string,
  list: string[],
): void {
  localStorage.setItem(
    getStorageKey(workspaceId, userId),
    JSON.stringify(list),
  );
}

export function usePinnedItems() {
  const { workspaceId: workspaceIdFromUrl } = useParams<{
    workspaceId: string;
  }>();
  const workspaceId =
    workspaceIdFromUrl ?? authenticationSession.getWorkspaceId()!;
  const userId = authenticationSession.getCurrentUserId()!;

  const [pinnedList, setPinnedList] = useState<string[]>(() =>
    readPinnedList(workspaceId, userId),
  );

  const pinnedIds = new Set(pinnedList);

  const isPinned = useCallback(
    (itemId: string) => pinnedList.includes(itemId),
    [pinnedList],
  );

  const pinOrder = useCallback(
    (itemId: string) => {
      const idx = pinnedList.indexOf(itemId);
      return idx === -1 ? Infinity : idx;
    },
    [pinnedList],
  );

  const togglePin = useCallback(
    (itemId: string) => {
      const wasPinned = pinnedList.includes(itemId);
      setPinnedList((prev) => {
        const idx = prev.indexOf(itemId);
        let next: string[];
        if (idx !== -1) {
          next = prev.filter((id) => id !== itemId);
        } else {
          next = [itemId, ...prev];
        }
        writePinnedList(workspaceId, userId, next);
        return next;
      });
      if (wasPinned) {
        toast.success(t('Removed from favorites.'));
      } else {
        toast.success(t('Favorited and moved to the top.'));
      }
    },
    [workspaceId, userId, pinnedList],
  );

  const unpinItem = useCallback(
    (itemId: string) => {
      setPinnedList((prev) => {
        if (!prev.includes(itemId)) return prev;
        const next = prev.filter((id) => id !== itemId);
        writePinnedList(workspaceId, userId, next);
        return next;
      });
    },
    [workspaceId, userId],
  );

  return { pinnedIds, pinnedList, isPinned, pinOrder, togglePin, unpinItem };
}
