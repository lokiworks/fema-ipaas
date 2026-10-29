import { t } from 'i18next';
import { useEffect, useRef } from 'react';
import {
  unstable_BlockerFunction,
  unstable_useBlocker,
} from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function useUnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  const dirtyRef = useRef(dirty);
  const skipRef = useRef(false);
  dirtyRef.current = dirty;

  const shouldBlock: unstable_BlockerFunction = ({
    currentLocation,
    nextLocation,
  }) => {
    if (skipRef.current) {
      skipRef.current = false;
      return false;
    }
    return (
      dirtyRef.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search)
    );
  };
  const blocker = unstable_useBlocker(shouldBlock);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [dirty]);

  const dialog = (
    <Dialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') {
          blocker.reset();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Leave without saving?')}</DialogTitle>
          <DialogDescription>
            {t(
              'You have unsaved changes. If you leave now, they will be lost.',
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (blocker.state === 'blocked') {
                blocker.reset();
              }
            }}
          >
            {t('Keep editing')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (blocker.state === 'blocked') {
                blocker.proceed();
              }
            }}
          >
            {t('Discard changes and leave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return {
    dialog,
    skipNextPrompt: () => {
      skipRef.current = true;
    },
  };
}
