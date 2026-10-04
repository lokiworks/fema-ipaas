import { isNil, assertNotNullOrUndefined } from '@fema-ipaas/core-utils';
import {
  Execution,
  ExecutionStatus,
  Permission,
  UpdateRunProgressRequest,
  WorkflowVersionState,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useRef } from 'react';
import { toast } from 'sonner';

import {
  useBuilderStateContext,
  useBuilderStore,
} from '@/app/builder/builder-hooks';
import { LeftSideBarType } from '@/app/builder/types';
import { executionUtils } from '@/features/executions';
import { useAuthorization } from '@/hooks/authorization-hooks';

export function useDebugRunProgress({
  returnsToEditing,
}: {
  returnsToEditing: boolean;
}): DebugRunProgress {
  const [
    workflowVersion,
    setRun,
    clearRun,
    selectStepByName,
    deselectStep,
    setLeftSidebar,
  ] = useBuilderStateContext((state) => [
    state.workflowVersion,
    state.setRun,
    state.clearRun,
    state.selectStepByName,
    state.deselectStep,
    state.setLeftSidebar,
  ]);
  const builderStore = useBuilderStore();
  const { checkAccess } = useAuthorization();
  const selectionBeforeRun = useRef<string | null>(null);
  const finishedRunId = useRef<string | null>(null);
  const lastRun = useRef<Execution | null>(null);
  const isDraft = workflowVersion.state === WorkflowVersionState.DRAFT;

  const returnToEditing = () => {
    clearRun(checkAccess(Permission.WRITE_WORKFLOW));
    const previous = selectionBeforeRun.current;
    if (isNil(previous)) {
      deselectStep();
    } else {
      selectStepByName(previous, { fromAutoFocus: true });
    }
    const finished = lastRun.current;
    toast.success(t('Debug passed. The draft is editable again.'), {
      duration: TOAST_DURATION_MS,
      ...(isNil(finished)
        ? {}
        : {
            action: {
              label: t('View debug records'),
              onClick: () => {
                setLeftSidebar(LeftSideBarType.RUNS);
                setRun(finished, workflowVersion);
              },
            },
          }),
    });
  };

  return {
    rememberSelection: () => {
      selectionBeforeRun.current = builderStore.getState().selectedStep;
      finishedRunId.current = null;
    },
    onUpdateRun: (response: UpdateRunProgressRequest) => {
      assertNotNullOrUndefined(response.execution, 'execution');
      const currentRun = builderStore.getState().run;
      const previousSteps = currentRun?.steps ?? {};
      const startTime = response.execution.startTime ?? currentRun?.startTime;
      const steps = isNil(response.step)
        ? previousSteps
        : executionUtils.updateRunSteps(
            previousSteps,
            response.step.name,
            response.step.path,
            response.step.output,
          );
      const nextRun = { ...response.execution, startTime, steps };
      lastRun.current = nextRun;
      setRun(nextRun, workflowVersion);
      const succeeded = response.execution.status === ExecutionStatus.SUCCEEDED;
      if (
        returnsToEditing &&
        isDraft &&
        succeeded &&
        finishedRunId.current !== response.execution.id
      ) {
        finishedRunId.current = response.execution.id;
        returnToEditing();
      }
    },
  };
}

const TOAST_DURATION_MS = 15000;

export type DebugRunProgress = {
  rememberSelection: () => void;
  onUpdateRun: (response: UpdateRunProgressRequest) => void;
};
