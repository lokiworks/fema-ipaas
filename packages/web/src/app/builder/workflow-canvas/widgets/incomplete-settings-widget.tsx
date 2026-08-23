import {
  WorkflowAction,
  WorkflowTriggerType,
  WorkflowVersion,
  Step,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useReactFlow } from '@xyflow/react';
import { t } from 'i18next';
import React, { useMemo } from 'react';

import { BuilderState } from '@/app/builder/builder-hooks';
import { Button } from '@/components/ui/button';

import { workflowCanvasUtils } from '../utils/workflow-canvas-utils';

type IncompleteSettingsButtonProps = {
  workflowVersion: WorkflowVersion;
  selectStepByName: BuilderState['selectStepByName'];
  setOpenedConnectorSelectorStepNameOrAddButtonId: BuilderState['setOpenedConnectorSelectorStepNameOrAddButtonId'];
};

const IncompleteSettingsButton: React.FC<IncompleteSettingsButtonProps> = ({
  workflowVersion,
  selectStepByName,
  setOpenedConnectorSelectorStepNameOrAddButtonId,
}) => {
  const invalidSteps = useMemo(
    () =>
      workflowStructureUtil
        .getAllSteps(workflowVersion.trigger)
        .filter(filterValidOrSkippedSteps).length,
    [workflowVersion],
  );
  const { fitView } = useReactFlow();
  function onClick() {
    const invalidSteps = workflowStructureUtil
      .getAllSteps(workflowVersion.trigger)
      .filter(filterValidOrSkippedSteps);
    if (invalidSteps.length > 0) {
      const stepToFocus = invalidSteps[0];
      selectStepByName(stepToFocus.name);
      if (stepToFocus.type === WorkflowTriggerType.EMPTY) {
        setOpenedConnectorSelectorStepNameOrAddButtonId(stepToFocus.name);
      }
      fitView(
        workflowCanvasUtils.createFocusStepInGraphParams(stepToFocus.name),
      );
    }
  }
  return (
    !workflowVersion.valid && (
      <Button
        variant="ghost"
        className="h-[28px] hover:bg-amber-50 p-2 dark:hover:bg-amber-950 dark:bg-amber-950 bg-amber-50 border border-solid border-amber-500 hover:border-amber-700 dark:hover:border-amber-600  dark:border-amber-900 dark:text-amber-600 text-amber-700 hover:text-amber-700 dark:hover:text-amber-600   animate-fade"
        key={'complete-workflow-button'}
        onClick={(e) => {
          onClick();
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {t('incompleteSteps', { invalidSteps: invalidSteps })}
      </Button>
    )
  );
};

IncompleteSettingsButton.displayName = 'IncompleteSettingsButton';
export default IncompleteSettingsButton;
function filterValidOrSkippedSteps(step: Step) {
  if ((step as WorkflowAction).skip) return false;
  return !step.valid;
}
