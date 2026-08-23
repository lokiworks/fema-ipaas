import { ViewportPortal } from '@xyflow/react';
import React from 'react';

import IncompleteSettingsButton from '@/app/builder/workflow-canvas/widgets/incomplete-settings-widget';
import { TestWorkflowWidget } from '@/app/builder/workflow-canvas/widgets/test-workflow-widget';
import WorkflowEndWidget from '@/app/builder/workflow-canvas/widgets/workflow-end-widget';

import { useBuilderStateContext } from '../../builder-hooks';
import { workflowCanvasConsts } from '../utils/consts';

const AboveWorkflowWidgets = React.memo(() => {
  const [
    workflowVersion,
    selectStepByName,
    readonly,
    setOpenedConnectorSelectorStepNameOrAddButtonId,
  ] = useBuilderStateContext((state) => [
    state.workflowVersion,
    state.selectStepByName,
    state.readonly,
    state.setOpenedConnectorSelectorStepNameOrAddButtonId,
  ]);
  return (
    <ViewportPortal>
      <WidgetWrapper>
        <div
          style={{
            transform: `translate(0px,-${workflowCanvasConsts.FEMA_NODE_SIZE.STEP.height}px )`,
            position: 'absolute',
            pointerEvents: 'auto',
          }}
        >
          <div className="justify-center items-center flex w-[260px]">
            <TestWorkflowWidget></TestWorkflowWidget>
            {!readonly && (
              <IncompleteSettingsButton
                workflowVersion={workflowVersion}
                selectStepByName={selectStepByName}
                setOpenedConnectorSelectorStepNameOrAddButtonId={
                  setOpenedConnectorSelectorStepNameOrAddButtonId
                }
              ></IncompleteSettingsButton>
            )}
          </div>
        </div>
      </WidgetWrapper>
    </ViewportPortal>
  );
});
AboveWorkflowWidgets.displayName = 'AboveWorkflowWidgets';
const BelowWorkflowWidget = React.memo(() => {
  return (
    <ViewportPortal>
      <WidgetWrapper>
        <div
          style={{
            pointerEvents: 'auto',
          }}
        >
          <div
            className="flex items-center justify-center gap-2"
            style={{
              width: workflowCanvasConsts.FEMA_NODE_SIZE.STEP.width + 'px',
            }}
          >
            <WorkflowEndWidget></WorkflowEndWidget>
          </div>
        </div>
      </WidgetWrapper>
    </ViewportPortal>
  );
});

const WidgetWrapper = ({ children }: { children: React.ReactNode }) => {
  const canvasOrientation = useBuilderStateContext(
    (state) => state.canvasOrientation,
  );
  return (
    <div
      style={{
        width:
          workflowCanvasConsts.STEP_NODE_SIZE[canvasOrientation].width + 'px',
      }}
      className="flex items-center justify-center"
    >
      {children}
    </div>
  );
};

BelowWorkflowWidget.displayName = 'BelowWorkflowWidget';
export { AboveWorkflowWidgets, BelowWorkflowWidget };
