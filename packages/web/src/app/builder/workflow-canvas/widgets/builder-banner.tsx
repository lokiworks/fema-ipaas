import { isNil, Permission } from '@fema-ipaas/core-utils';
import { WorkflowTriggerType } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Eye, Info, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { useBuilderStateContext } from '../../builder-hooks';
import { useBuilderSnapshotVersionId } from '../../snapshot-context';

import { AiPendingReviewWidget } from './ai-pending-review-widget';
import LargeWidgetWrapper from './large-widget-wrapper';
import { RunInfoWidget } from './run-info-widget';
import { SnapshotWidget } from './snapshot-widget';
import { useWorkflowLock } from './use-workflow-lock';
import { ViewingOldVersionWidget } from './viewing-old-version-widget';

const BuilderBanner = () => {
  const snapshotVersionId = useBuilderSnapshotVersionId();
  if (!isNil(snapshotVersionId)) {
    return <SnapshotWidget versionId={snapshotVersionId} />;
  }
  return <EditingBanner />;
};

function EditingBanner() {
  const { lockedBy, takeOver, requestEdit, canTakeOver } = useWorkflowLock();
  const [run, readonly, trigger] = useBuilderStateContext((state) => [
    state.run,
    state.readonly,
    state.workflowVersion.trigger,
  ]);
  const { checkAccess, isFetchingProjectRole } = useAuthorization();
  const canEdit = checkAccess(Permission.WRITE_WORKFLOW);

  if (lockedBy) {
    return (
      <LargeWidgetWrapper containerClassName="border-warning/40 bg-warning/5">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Lock className="size-4 shrink-0 text-warning" />
          <span>
            {t(
              '{name} is editing this workflow. Only one person can edit at a time, so you can only view it now.',
              { name: lockedBy.userDisplayName },
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={requestEdit}>
            {t('Request to edit')}
          </Button>
          {canTakeOver && (
            <Button size="sm" onClick={takeOver}>
              {t('Take over editing')}
            </Button>
          )}
        </div>
      </LargeWidgetWrapper>
    );
  }
  if (!isNil(run)) {
    return <RunInfoWidget />;
  }
  if (!canEdit && !isFetchingProjectRole) {
    return (
      <LargeWidgetWrapper>
        <div className="flex items-center gap-2 text-sm">
          <Eye className="size-4 shrink-0" />
          <span>
            {t(
              'You can view this project. You can see the configuration and runs, but you cannot edit or publish.',
            )}
          </span>
        </div>
      </LargeWidgetWrapper>
    );
  }
  if (readonly) {
    return <ViewingOldVersionWidget />;
  }
  if (trigger.type === WorkflowTriggerType.EMPTY && isNil(trigger.nextAction)) {
    return (
      <LargeWidgetWrapper>
        <div className="flex items-center gap-2 text-sm">
          <Info className="size-4 shrink-0" />
          <span>
            {t(
              'This workflow is empty. Pick a trigger to start, or ask the AI assistant to build it.',
            )}
          </span>
        </div>
      </LargeWidgetWrapper>
    );
  }
  return <AiPendingReviewWidget />;
}

BuilderBanner.displayName = 'BuilderBanner';
export { BuilderBanner };
