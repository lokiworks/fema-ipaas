import { isNil, Permission } from '@fema/core-utils';
import { t } from 'i18next';
import { Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { EditWorkflowOrViewDraftButton } from '../../builder-header/workflow-status/view-draft-or-edit-workflow-button';
import { useBuilderStateContext } from '../../builder-hooks';
import { OverwriteDraftDialog } from '../../workflow-versions/overwrite-draft-dialog';

import LargeWidgetWrapper from './large-widget-wrapper';

const ViewingOldVersionWidget = () => {
  const [run, readonly, version, isPublishing] = useBuilderStateContext(
    (state) => [
      state.run,
      state.readonly,
      state.workflowVersion,
      state.isPublishing,
    ],
  );
  const versionNumber = workflowHooks
    .useGetWorkflowVersionNumber({
      workflowId: version.workflowId,
      versionId: version.id,
    })
    .toString();
  const { checkAccess } = useAuthorization();
  const hasPermissionToWriteWorkflow = checkAccess(Permission.WRITE_WORKFLOW);
  if (!isNil(run) || !readonly || isPublishing) {
    return null;
  }
  return (
    <LargeWidgetWrapper>
      <>
        <div className="flex items-center gap-2">
          <Info className="size-5" />
          <span>
            {t('Viewing version')} #{versionNumber}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasPermissionToWriteWorkflow && (
            <OverwriteDraftDialog
              versionId={version.id}
              versionNumber={versionNumber}
              onConfirm={undefined}
            >
              <Button variant="ghost" size="sm">
                {t('Use as Draft')}
              </Button>
            </OverwriteDraftDialog>
          )}
          <EditWorkflowOrViewDraftButton
            onCanvas={false}
          ></EditWorkflowOrViewDraftButton>
        </div>
      </>
    </LargeWidgetWrapper>
  );
};
export { ViewingOldVersionWidget };
