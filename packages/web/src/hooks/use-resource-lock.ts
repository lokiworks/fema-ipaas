import {
  ResourceEditRequestedEvent,
  ResourceLockedEvent,
  ResourceUnlockedEvent,
  LockResourceResponse,
  WebsocketClientEvent,
  WebsocketServerEvent,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSocket } from '@/components/providers/socket-provider';
import { authenticationSession } from '@/lib/authentication-session';

function useResourceLock({
  resourceId,
  onTakeOver,
  isActive,
  enabled = true,
}: UseResourceLockParams) {
  const socket = useSocket();
  const currentUserId = authenticationSession.getCurrentUserId();
  const isOwner = useRef(false);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const [lockSession, setLockSession] = useState(0);
  const [lockedBy, setLockedBy] = useState<LockHolder | null>(null);

  useEffect(() => {
    const handleLocked = (event: ResourceLockedEvent) => {
      if (event.resourceId !== resourceId || event.userId === currentUserId) {
        return;
      }
      if (event.previousUserId === currentUserId) {
        isOwner.current = false;
        toast.warning(
          event.takenOver
            ? t('{name} took over editing. Your saved changes are kept.', {
                name: event.userDisplayName,
              })
            : t(
                'Your edit lock expired and {name} is editing now. Your saved changes are kept.',
                { name: event.userDisplayName },
              ),
        );
      }
      setLockedBy({
        userId: event.userId,
        userDisplayName: event.userDisplayName,
      });
    };
    const handleUnlocked = (event: ResourceUnlockedEvent) => {
      if (event.resourceId === resourceId) {
        setLockedBy(null);
      }
    };
    const handleEditRequested = (event: ResourceEditRequestedEvent) => {
      if (
        event.resourceId === resourceId &&
        event.holderUserId === currentUserId
      ) {
        toast.info(
          t('{name} asked to edit this workflow', {
            name: event.requesterDisplayName,
          }),
          {
            description: t(
              'Finish your changes and leave the editor so they can take over.',
            ),
          },
        );
      }
    };

    socket.on(WebsocketClientEvent.RESOURCE_LOCKED, handleLocked);
    socket.on(WebsocketClientEvent.RESOURCE_UNLOCKED, handleUnlocked);
    socket.on(
      WebsocketClientEvent.RESOURCE_EDIT_REQUESTED,
      handleEditRequested,
    );

    return () => {
      socket.off(WebsocketClientEvent.RESOURCE_LOCKED, handleLocked);
      socket.off(WebsocketClientEvent.RESOURCE_UNLOCKED, handleUnlocked);
      socket.off(
        WebsocketClientEvent.RESOURCE_EDIT_REQUESTED,
        handleEditRequested,
      );
    };
  }, [resourceId, socket, currentUserId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    socket.emit(
      WebsocketServerEvent.LOCK_RESOURCE,
      { resourceId, active: true },
      (response: LockResourceResponse) => {
        if (response.acquired) {
          isOwner.current = true;
          setLockedBy(null);
        } else if (response.lock) {
          setLockedBy(response.lock);
        }
      },
    );

    const heartbeat = setInterval(() => {
      if (!isOwner.current) {
        return;
      }
      socket.emit(
        WebsocketServerEvent.LOCK_RESOURCE,
        { resourceId, active: isActiveRef.current?.() ?? false },
        (response: LockResourceResponse) => {
          if (!response.acquired && response.lock) {
            isOwner.current = false;
            setLockedBy(response.lock);
          }
        },
      );
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(heartbeat);
      if (isOwner.current) {
        socket.emit(WebsocketServerEvent.UNLOCK_RESOURCE, { resourceId });
        isOwner.current = false;
      }
    };
  }, [resourceId, socket, lockSession, enabled]);

  const takeOver = useCallback(() => {
    socket.emit(
      WebsocketServerEvent.LOCK_RESOURCE,
      { resourceId, force: true, active: true },
      (response: LockResourceResponse) => {
        if (response.acquired) {
          isOwner.current = false;
          setLockedBy(null);
          setLockSession((session) => session + 1);
          void onTakeOver?.();
          return;
        }
        if (response.reason === 'NOT_ALLOWED') {
          toast.error(t('Only project owners can take over editing'));
        }
      },
    );
  }, [resourceId, socket, onTakeOver]);

  const requestEdit = useCallback(() => {
    socket.emit(
      WebsocketServerEvent.REQUEST_RESOURCE_EDIT,
      { resourceId },
      (response: { sent: boolean }) => {
        if (response.sent) {
          toast.success(t('Edit request sent'));
          return;
        }
        setLockSession((session) => session + 1);
      },
    );
  }, [resourceId, socket]);

  return { lockedBy, takeOver, requestEdit };
}

export { useResourceLock };

const HEARTBEAT_MS = 30_000;

type LockHolder = {
  userId: string;
  userDisplayName: string;
};

type UseResourceLockParams = {
  resourceId: string;
  onTakeOver?: () => void | Promise<void>;
  isActive?: () => boolean;
  enabled?: boolean;
};
