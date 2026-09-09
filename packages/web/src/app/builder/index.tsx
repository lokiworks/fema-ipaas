import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PanelImperativeHandle } from 'react-resizable-panels';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { DataSelector } from '@/app/builder/data-selector';
import { StepSettingsProvider } from '@/app/builder/step-settings/step-settings-context';
import { RightSideBarType } from '@/app/builder/types';
import { CanvasControls } from '@/app/builder/workflow-canvas/canvas-controls';
import { ShowPoweredBy } from '@/components/custom/show-powered-by';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable-panel';
import { componentsHooks } from '@/features/components';
import { connectorsHooks } from '@/features/connectors';
import { useElementSize } from '@/hooks/use-element-size';
import { cn } from '@/lib/utils';

import { BuilderHeader } from './builder-header/builder-header';
import { BuilderLeftPanel } from './left-panel';
import { CursorPositionProvider } from './state/cursor-position-context';
import { StepSettingsContainer } from './step-settings';
import { WorkflowCanvas } from './workflow-canvas';
import { workflowCanvasHooks } from './workflow-canvas/hooks';
import { workflowCanvasConsts } from './workflow-canvas/utils/consts';
import { BuilderBanner } from './workflow-canvas/widgets/builder-banner';
const animateResizeClassName = `transition-all `;

const DEFAULT_SIDEBAR_SIZE_PX = 320;
const DEFAULT_MIN_SIZE = '280px';

const BuilderPage = () => {
  const [
    workflowVersion,
    rightSidebar,
    leftSidebar,
    selectedStepName,
    removeAllStepTestsListeners,
    selectedStep,
  ] = useBuilderStateContext((state) => [
    state.workflowVersion,
    state.rightSidebar,
    state.leftSidebar,
    state.selectedStep,
    state.removeAllStepTestsListeners,
    workflowStructureUtil.getStep(
      state.selectedStep ?? '',
      state.workflowVersion.trigger,
    ),
  ]);
  useEffect(() => {
    return () => {
      removeAllStepTestsListeners();
    };
  }, [removeAllStepTestsListeners]);
  workflowCanvasHooks.useShowBuilderIsSavingWarningBeforeLeaving();
  const middlePanelRef = useRef<HTMLDivElement>(null);
  const middlePanelSize = useElementSize(middlePanelRef);
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);
  useEffect(() => {
    const handlePointerUp = () => setIsDraggingHandle(false);
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);
  const rightHandleRef = useRef<PanelImperativeHandle>(null);
  const rightSidePanelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const handle = rightHandleRef.current;
    if (!handle) return;
    if (rightSidebar === RightSideBarType.NONE) {
      handle.resize('0%');
      return;
    }
    handle.resize(DEFAULT_SIDEBAR_SIZE_PX);
    const rafId = window.requestAnimationFrame(() =>
      handle.resize(DEFAULT_SIDEBAR_SIZE_PX),
    );
    return () => window.cancelAnimationFrame(rafId);
  }, [rightSidebar, leftSidebar]);

  const {
    connectorModel,
    isNotFound: connectorModelNotFound,
    refetch: refetchConnector,
  } = connectorsHooks.useConnectorModelForStepSettings({
    name: selectedStep?.settings.connectorName,
    version: selectedStep?.settings.connectorVersion,
    enabled:
      selectedStep?.type === WorkflowActionType.CONNECTOR ||
      selectedStep?.type === WorkflowTriggerType.CONNECTOR,
  });
  const { data: flowComponents } = componentsHooks.useComponents();
  workflowCanvasHooks.useSetSocketListener(refetchConnector);
  workflowCanvasHooks.useListenToExistingRun();

  const [hasCanvasBeenInitialised, setHasCanvasBeenInitialised] =
    useState(false);

  return (
    <div className="flex h-full w-full flex-col relative max-h-[100vh]">
      <div className="z-40">
        <BuilderHeader />
      </div>
      <ResizablePanelGroup orientation="horizontal">
        <BuilderLeftPanel />
        <ResizablePanel defaultSize="100%" id="workflow-canvas">
          <div ref={middlePanelRef} className="relative h-full w-full">
            <CursorPositionProvider>
              <WorkflowCanvas
                setHasCanvasBeenInitialised={setHasCanvasBeenInitialised}
              ></WorkflowCanvas>
            </CursorPositionProvider>

            <BuilderBanner />
            {middlePanelRef.current &&
              middlePanelRef.current.clientWidth > 0 && (
                <CanvasControls
                  canvasHeight={middlePanelRef.current?.clientHeight ?? 0}
                  canvasWidth={middlePanelRef.current?.clientWidth ?? 0}
                  hasCanvasBeenInitialised={hasCanvasBeenInitialised}
                  selectedStep={selectedStepName}
                ></CanvasControls>
              )}

            <ShowPoweredBy position="absolute" show={false} />
            <DataSelector
              parentHeight={middlePanelSize.height}
              parentWidth={middlePanelSize.width}
            ></DataSelector>
          </div>
        </ResizablePanel>

        <ResizableHandle
          disabled={rightSidebar === RightSideBarType.NONE}
          withHandle={rightSidebar !== RightSideBarType.NONE}
          onPointerDown={() => setIsDraggingHandle(true)}
          onPointerUp={() => setIsDraggingHandle(false)}
          onPointerCancel={() => setIsDraggingHandle(false)}
          className={
            rightSidebar === RightSideBarType.NONE ? 'bg-transparent' : ''
          }
        />

        <ResizablePanel
          panelRef={rightHandleRef}
          id="right-sidebar"
          collapsedSize="0%"
          defaultSize="0%"
          minSize={
            rightSidebar === RightSideBarType.NONE ? '0%' : DEFAULT_MIN_SIZE
          }
          maxSize={rightSidebar === RightSideBarType.NONE ? '0%' : '60%'}
          className={cn('min-w-0 bg-background z-30', {
            [animateResizeClassName]: !isDraggingHandle,
          })}
          style={{
            transitionDuration: `${
              isDraggingHandle
                ? 0
                : workflowCanvasConsts.SIDEBAR_ANIMATION_DURATION
            }ms`,
          }}
        >
          <div ref={rightSidePanelRef} className="h-full w-full">
            {rightSidebar === RightSideBarType.CONNECTOR_SETTINGS &&
              selectedStep && (
                <StepSettingsProvider
                  connectorModel={connectorModel}
                  componentProps={
                    selectedStep.type === WorkflowActionType.COMPONENT
                      ? flowComponents?.find(
                          (candidate) =>
                            candidate.type ===
                            selectedStep.settings.componentType,
                        )?.props
                      : undefined
                  }
                  connectorModelNotFound={connectorModelNotFound}
                  selectedStep={selectedStep}
                  key={constructContainerKey({
                    workflowVersionId: workflowVersion.id,
                    step: selectedStep,
                    hasConnectorModelLoaded: !!connectorModel,
                  })}
                >
                  <StepSettingsContainer />
                </StepSettingsProvider>
              )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

BuilderPage.displayName = 'BuilderPage';
export { BuilderPage };

function constructContainerKey({
  workflowVersionId,
  step,
  hasConnectorModelLoaded,
}: {
  workflowVersionId: string;
  step?: WorkflowAction | WorkflowTrigger;
  hasConnectorModelLoaded: boolean;
}) {
  const stepName = step?.name;
  const triggerOrActionName =
    step?.type === WorkflowTriggerType.CONNECTOR
      ? step?.settings.triggerName
      : step?.settings.actionName;
  const connectorName =
    step?.type === WorkflowTriggerType.CONNECTOR ||
    step?.type === WorkflowActionType.CONNECTOR
      ? step?.settings.connectorName
      : undefined;
  const connectorVersion =
    step?.type === WorkflowTriggerType.CONNECTOR ||
    step?.type === WorkflowActionType.CONNECTOR
      ? step?.settings.connectorVersion
      : undefined;
  //we need to re-render the step settings form when the step is skipped, so when the user edits the settings after setting it to skipped the changes are reflected in the update request
  const isSkipped =
    step?.type != WorkflowTriggerType.EMPTY &&
    step?.type != WorkflowTriggerType.CONNECTOR &&
    step?.skip;
  return `${workflowVersionId}-${stepName ?? ''}-${triggerOrActionName ?? ''}-${
    connectorName ?? ''
  }-${connectorVersion ?? ''}-${'skipped-' + !!isSkipped}-${
    hasConnectorModelLoaded ? 'loaded' : 'not-loaded'
  }`;
}
