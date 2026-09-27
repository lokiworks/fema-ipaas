import {
  StepLocationRelativeToParent,
  WorkflowOperationType,
  WorkflowTriggerType,
  WorkflowVersion,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useState } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { ConnectorPickerPanel } from '@/app/builder/connector-picker-panel';
import { DebugRecordsPanel } from '@/app/builder/debug/debug-records-panel';
import { LeftSideBarType } from '@/app/builder/types';
import { WorkflowVersionsList } from '@/app/builder/workflow-versions';
import { ConnectorSelectorOperation } from '@/features/connectors';

import { useBuilderValidation } from '../validation/validation-context';

import { StepSearchPanel } from './step-search-panel';
import { ToolRail } from './tool-rail';
import { ValidationPanel } from './validation-panel';

export function BuilderLeftPanel() {
  const { errorCount, warningCount } = useBuilderValidation();
  const [recordsWidth, setRecordsWidth] = useState(MIN_RECORDS_WIDTH);
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
        badges={{
          [LeftSideBarType.VALIDATION]:
            errorCount > 0
              ? { count: errorCount, tone: 'error' }
              : { count: warningCount, tone: 'warning' },
        }}
      />
      {leftSidebar !== LeftSideBarType.NONE && (
        <div
          className="relative flex h-full shrink-0 flex-col border-r bg-background"
          style={{
            width:
              leftSidebar === LeftSideBarType.RUNS
                ? recordsWidth
                : DEFAULT_PANEL_WIDTH,
          }}
        >
          {leftSidebar === LeftSideBarType.CONNECTOR_PICKER && (
            <ConnectorPickerPanel />
          )}
          {leftSidebar === LeftSideBarType.RUNS && <DebugRecordsPanel />}
          {leftSidebar === LeftSideBarType.VERSIONS && <WorkflowVersionsList />}
          {leftSidebar === LeftSideBarType.VALIDATION && <ValidationPanel />}
          {leftSidebar === LeftSideBarType.SEARCH && <StepSearchPanel />}
          {leftSidebar === LeftSideBarType.RUNS && (
            <PanelResizeHandle
              width={recordsWidth}
              onResize={setRecordsWidth}
            />
          )}
        </div>
      )}
    </div>
  );
}

function PanelResizeHandle({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}) {
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const handleMove = (moveEvent: PointerEvent) => {
      const next = startWidth + moveEvent.clientX - startX;
      onResize(Math.min(MAX_RECORDS_WIDTH, Math.max(MIN_RECORDS_WIDTH, next)));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={startResize}
      className="absolute right-0 top-0 z-10 h-full w-1.5 translate-x-1/2 cursor-col-resize hover:bg-primary/30"
    />
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

const DEFAULT_PANEL_WIDTH = 260;
const MIN_RECORDS_WIDTH = 520;
const MAX_RECORDS_WIDTH = 960;
