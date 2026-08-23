import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
  workflowStructureUtil,
} from '@fema/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PanelImperativeHandle } from 'react-resizable-panels';
import { usePrevious } from 'react-use';

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
import { connectorsHooks } from '@/features/connectors';
import { platformHooks } from '@/hooks/platform-hooks';
import { useElementSize } from '@/hooks/use-element-size';
import { cn } from '@/lib/utils';

import { BuilderHeader } from './builder-header/builder-header';
import { RunsList } from './run-list';
import { CursorPositionProvider } from './state/cursor-position-context';
import { StepSettingsContainer } from './step-settings';
import { WorkflowCanvas } from './workflow-canvas';
import { workflowCanvasHooks } from './workflow-canvas/hooks';
import { workflowCanvasConsts } from './workflow-canvas/utils/consts';
import { BuilderBanner } from './workflow-canvas/widgets/builder-banner';
import { WorkflowVersionsList } from './workflow-versions';
const animateResizeClassName = `transition-all `;

const SPLIT_MODE_INITIAL_OPEN_SIZE_PX = 1000;
const SPLIT_MODE_SIDEBAR_SIZE_PX = 850;
const DEFAULT_SIDEBAR_SIZE = '25%';
const DEFAULT_MIN_SIZE = '400px';
const SPLIT_MODE_COLLAPSE_THRESHOLD_PX = 700;

const BuilderPage = () => {
  const { platform } = platformHooks.useCurrentPlatform();
  const [
    workflowVersion,
    rightSidebar,
    selectedStepName,
    removeAllStepTestsListeners,
    selectedStep,
    stepDataPanelView,
    isStepDataPanelOpen,
    setStepDataPanelView,
    setStepDataPanelOpen,
  ] = useBuilderStateContext((state) => [
    state.workflowVersion,
    state.rightSidebar,
    state.selectedStep,
    state.removeAllStepTestsListeners,
    workflowStructureUtil.getStep(
      state.selectedStep ?? '',
      state.workflowVersion.trigger,
    ),
    state.stepDataPanelView,
    state.isStepDataPanelOpen,
    state.setStepDataPanelView,
    state.setStepDataPanelOpen,
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
  const isSplitForConnector =
    rightSidebar === RightSideBarType.CONNECTOR_SETTINGS &&
    stepDataPanelView === 'split' &&
    isStepDataPanelOpen;
  const prefersSplitLayout =
    rightSidebar === RightSideBarType.CONNECTOR_SETTINGS &&
    stepDataPanelView === 'split';

  const rightHandleRef = useRef<PanelImperativeHandle>(null);
  const rightSidePanelRef = useRef<HTMLDivElement>(null);
  const previousRightSidebar = usePrevious(rightSidebar);

  useLayoutEffect(() => {
    const handle = rightHandleRef.current;
    if (!handle) return;
    if (rightSidebar === RightSideBarType.NONE) {
      handle.resize('0%');
      return;
    }
    const isInitialOpen = previousRightSidebar === RightSideBarType.NONE;
    const targetSize = prefersSplitLayout
      ? isInitialOpen
        ? SPLIT_MODE_INITIAL_OPEN_SIZE_PX
        : SPLIT_MODE_SIDEBAR_SIZE_PX
      : DEFAULT_SIDEBAR_SIZE;
    handle.resize(targetSize);
    const rafId = window.requestAnimationFrame(() => handle.resize(targetSize));
    return () => window.cancelAnimationFrame(rafId);
  }, [prefersSplitLayout, previousRightSidebar, rightSidebar]);

  useEffect(() => {
    if (!isSplitForConnector || !isDraggingHandle) return;
    const el = rightSidePanelRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0 && width < SPLIT_MODE_COLLAPSE_THRESHOLD_PX) {
        setStepDataPanelView('drawer');
        setStepDataPanelOpen(false);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    isSplitForConnector,
    isDraggingHandle,
    setStepDataPanelView,
    setStepDataPanelOpen,
  ]);
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

            <ShowPoweredBy
              position="absolute"
              show={platform?.plan.showPoweredBy}
            />
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
          maxSize={
            rightSidebar === RightSideBarType.NONE
              ? '0%'
              : prefersSplitLayout
              ? '95%'
              : '60%'
          }
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
            {rightSidebar === RightSideBarType.RUNS && <RunsList />}
            {rightSidebar === RightSideBarType.VERSIONS && (
              <WorkflowVersionsList />
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
