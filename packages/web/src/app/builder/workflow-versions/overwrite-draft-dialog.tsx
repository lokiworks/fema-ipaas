import { Permission } from '@fema/core-utils';
import { t } from 'i18next';
import { useState } from 'react';

import { RightSideBarType } from '@/app/builder/types';
import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { useBuilderStateContext } from '../builder-hooks';

const OverwriteDraftDialog = ({
  onConfirm,
  children,
  versionId,
  versionNumber,
}: OverwriteDraftDialogProps) => {
  const { checkAccess } = useAuthorization();
  const [setVersion, setRightSidebar, workflow] = useBuilderStateContext(
    (state) => [state.setVersion, state.setRightSidebar, state.workflow],
  );
  const { mutate: overWriteDraftWithVersion, isPending: isOverwritingDraft } =
    workflowHooks.useOverWriteDraftWithVersion({
      onSuccess: (updatedWorkflow) => {
        setVersion(updatedWorkflow.version);
        setRightSidebar(RightSideBarType.NONE);
      },
    });
  const userHasPermissionToWriteWorkflow = checkAccess(
    Permission.WRITE_WORKFLOW,
  );
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        disabled={!userHasPermissionToWriteWorkflow}
        className="w-full"
      >
        <PermissionNeededTooltip
          hasPermission={userHasPermissionToWriteWorkflow}
        >
          {children}
        </PermissionNeededTooltip>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Overwrite Draft')}</DialogTitle>
          <DialogDescription>
            {t('Your current draft will be replaced with')}{' '}
            <span className="font-semibold">
              {t('version #{versionNumber}', { versionNumber })}
            </span>
            {'. '}
            {t('This cannot be undone.')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="justify-end">
          <DialogClose asChild>
            <Button variant={'outline'}>{t('Cancel')}</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              loading={isOverwritingDraft}
              onClick={() => {
                overWriteDraftWithVersion({
                  workflowId: workflow.id,
                  versionId: versionId,
                });
                onConfirm?.();
              }}
            >
              {t('Overwrite')}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
type OverwriteDraftDialogProps = {
  onConfirm: (() => void) | undefined;
  children: React.ReactNode;
  versionId: string;
  versionNumber: string;
};
export { OverwriteDraftDialog };
