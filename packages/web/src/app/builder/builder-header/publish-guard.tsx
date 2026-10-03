import { isNil } from '@fema-ipaas/core-utils';
import { workflowStructureUtil } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { LeftSideBarType } from '@/app/builder/types';
import { useBuilderValidation } from '@/app/builder/validation/validation-context';
import { validationMessages } from '@/app/builder/validation/validation-messages';
import {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity,
} from '@/app/builder/validation/workflow-validator';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

import { PublishTarget, publishGuardLabels } from './publish-guard-labels';

export function usePublishGuard({
  lockedByName,
  target = 'production',
}: {
  lockedByName: string | null;
  target?: PublishTarget;
}): PublishGuard {
  const validation = useBuilderValidation();
  const setLeftSidebar = useBuilderStateContext(
    (state) => state.setLeftSidebar,
  );
  const [pending, setPending] = useState<PendingAction | null>(null);

  const blockedReason = pickBlockedReason({
    lockedByName,
    errorCount: validation.errorCount,
    isLoading: validation.isLoading,
  });
  const warnings = validation.issues.filter(
    (issue) => issue.severity === ValidationSeverity.WARNING,
  );

  const run = (action: () => void) => {
    if (!isNil(blockedReason)) {
      if (validation.errorCount > 0) {
        setLeftSidebar(LeftSideBarType.VALIDATION);
      }
      return;
    }
    if (warnings.length > 0) {
      setPending({ action });
      return;
    }
    action();
  };

  const dialog = (
    <PublishWarningsDialog
      open={!isNil(pending)}
      target={target}
      warnings={warnings}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const action = pending?.action;
        setPending(null);
        action?.();
      }}
    />
  );

  return { run, blockedReason, dialog };
}

function pickBlockedReason({
  lockedByName,
  errorCount,
  isLoading,
}: {
  lockedByName: string | null;
  errorCount: number;
  isLoading: boolean;
}): string | null {
  if (!isNil(lockedByName)) {
    return t('{name} is editing this workflow, so it cannot be published now', {
      name: lockedByName,
    });
  }
  if (errorCount > 0) {
    return t(
      '{count, plural, =1 {Fix 1 error before publishing} other {Fix # errors before publishing}}',
      { count: errorCount },
    );
  }
  if (isLoading) {
    return t('Checking the workflow...');
  }
  return null;
}

function PublishWarningsDialog({
  open,
  target,
  warnings,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  target: PublishTarget;
  warnings: ValidationIssue[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const trigger = useBuilderStateContext(
    (state) => state.workflowVersion.trigger,
  );
  const hasAiPending = warnings.some(
    (issue) => issue.code === ValidationCode.AI_PENDING_REVIEW,
  );
  const labels = publishGuardLabels.dialogLabels({ target, hasAiPending });
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-72">
          <div className="flex flex-col gap-2">
            {warnings.map((issue) => (
              <div key={issue.id} className="flex items-start gap-2 text-sm">
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <div className="flex min-w-0 flex-col">
                  <span>{validationMessages.messageOf(issue)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {workflowStructureUtil.getStep(issue.stepName, trigger)
                      ?.displayName ?? issue.stepName}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {labels.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type PublishGuard = {
  run: (action: () => void) => void;
  blockedReason: string | null;
  dialog: React.ReactNode;
};

type PendingAction = {
  action: () => void;
};
