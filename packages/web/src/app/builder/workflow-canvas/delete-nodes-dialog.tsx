import { WorkflowOperationType } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useBuilderStateContext } from '../builder-hooks';

import { deleteSelectedNodes } from './utils/bulk-actions';
import { useDeleteConfirmation } from './utils/delete-confirmation-store';

export function DeleteNodesDialog() {
  const { pending, close } = useDeleteConfirmation();
  const [
    applyOperation,
    selectedStep,
    exitStepSettings,
    selectStepByName,
    setSelectedBranchIndex,
  ] = useBuilderStateContext((state) => [
    state.applyOperation,
    state.selectedStep,
    state.exitStepSettings,
    state.selectStepByName,
    state.setSelectedBranchIndex,
  ]);
  const branch = pending?.branch ?? null;
  const dependentNames =
    pending?.dependents.map((step) => step.displayName) ?? [];
  const shownNames = dependentNames.slice(0, MAX_NAMES_SHOWN);
  const removedNames =
    branch?.removedSteps.map((step) => step.displayName) ?? [];
  const shownRemovedNames = removedNames.slice(0, MAX_NAMES_SHOWN);
  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {branch === null
              ? t('Delete the selected steps?')
              : t('Delete this branch and the steps in it?')}
          </DialogTitle>
          <DialogDescription>
            {t('You can undo this afterwards')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm">
          {removedNames.length > 0 && (
            <p>
              {t(
                'These steps in the branch are deleted too ({count, plural, =1 {1 step} other {# steps}}): {names}',
                {
                  count: removedNames.length,
                  names: `${shownRemovedNames.join(', ')}${
                    removedNames.length > MAX_NAMES_SHOWN ? '…' : ''
                  }`,
                },
              )}
            </p>
          )}
          {pending !== null && pending.nestedCount > 0 && (
            <p>
              {t(
                'The steps inside them are deleted too: {count, plural, =1 {1 step} other {# steps}}',
                { count: pending.nestedCount },
              )}
            </p>
          )}
          {dependentNames.length > 0 && (
            <p>
              {t('These steps use their output and will show errors: {names}', {
                names: `${shownNames.join(', ')}${
                  dependentNames.length > MAX_NAMES_SHOWN ? '…' : ''
                }`,
              })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (pending === null) {
                return;
              }
              if (branch !== null) {
                setSelectedBranchIndex(null);
                applyOperation({
                  type: WorkflowOperationType.DELETE_BRANCH,
                  request: {
                    stepName: branch.stepName,
                    branchIndex: branch.branchIndex,
                  },
                });
                selectStepByName(branch.stepName);
                close();
                return;
              }
              deleteSelectedNodes({
                selectedNodes: pending.names,
                applyOperation,
                selectedStep,
                exitStepSettings,
              });
              close();
            }}
          >
            {t('Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MAX_NAMES_SHOWN = 3;
