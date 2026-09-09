import {
  StepLocationRelativeToParent,
  WorkflowOperationType,
  WorkflowTriggerType,
  WorkflowVersion,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { ConnectorPickerPanel } from '@/app/builder/connector-picker-panel';
import { RunsList } from '@/app/builder/run-list';
import { LeftSideBarType } from '@/app/builder/types';
import { WorkflowVersionsList } from '@/app/builder/workflow-versions';
import { ConnectorSelectorOperation } from '@/features/connectors';

import { ToolRail } from './tool-rail';
import { useInvalidSteps, ValidationPanel } from './validation-panel';

export function BuilderLeftPanel() {
  const invalidStepCount = useInvalidSteps().length;
  const [leftSidebar, setLeftSidebar, openPicker, workflowVersion] =
    useBuilderStateContext((state) => [
      state.leftSidebar,
      state.setLeftSidebar,
      state.setOpenedConnectorSelectorStepNameOrAddButtonId,
      state.workflowVersion,
    ]);

  const handleSelect = (type: LeftSideBarType) => {
    if (leftSidebar === LeftSideBarType.CONNECTOR_PICKER) {
      openPicker(null);
    }
    if (type === LeftSideBarType.CONNECTOR_PICKER) {
      const { stepName, operation } = resolvePickerTarget(workflowVersion);
      openPicker(stepName, operation);
      return;
    }
    setLeftSidebar(type);
  };

  return (
    <div className="flex h-full shrink-0 flex-row">
      <ToolRail
        active={leftSidebar}
        onSelect={handleSelect}
        badges={{ [LeftSideBarType.VALIDATION]: invalidStepCount }}
      />
      {leftSidebar !== LeftSideBarType.NONE && (
        <div className="flex h-full w-[260px] shrink-0 flex-col border-r bg-background">
          {leftSidebar === LeftSideBarType.CONNECTOR_PICKER && (
            <ConnectorPickerPanel />
          )}
          {leftSidebar === LeftSideBarType.RUNS && <RunsList />}
          {leftSidebar === LeftSideBarType.VERSIONS && <WorkflowVersionsList />}
          {leftSidebar === LeftSideBarType.VALIDATION && <ValidationPanel />}
        </div>
      )}
    </div>
  );
}

function resolvePickerTarget(workflowVersion: WorkflowVersion): {
  stepName: string;
  operation: ConnectorSelectorOperation;
} {
  const { trigger } = workflowVersion;
  if (trigger.type === WorkflowTriggerType.EMPTY) {
    return {
      stepName: trigger.name,
      operation: { type: WorkflowOperationType.UPDATE_TRIGGER },
    };
  }
  const mainPath =
    workflowStructureUtil.getAllNextActionsWithoutChildren(trigger);
  const parentStep = mainPath.at(-1)?.name ?? trigger.name;
  return {
    stepName: parentStep,
    operation: {
      type: WorkflowOperationType.ADD_ACTION,
      actionLocation: {
        parentStep,
        stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
      },
    },
  };
}
