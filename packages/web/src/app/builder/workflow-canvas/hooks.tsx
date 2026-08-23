import { Permission, isNil } from '@fema/core-utils';
import {
  ExecutionStatus,
  WebsocketClientEvent,
  RunEnvironment,
  isExecutionStateTerminal,
} from '@fema/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useReactFlow } from '@xyflow/react';
import { t } from 'i18next';
import { useEffect, useRef } from 'react';
import { useLocation, usePrevious } from 'react-use';
import { useDebouncedCallback } from 'use-debounce';

import { useEmbedding } from '@/components/providers/embed-provider';
import { useSocket } from '@/components/providers/socket-provider';
import { internalErrorToast } from '@/components/ui/sonner';
import { executionsApi, executionUtils } from '@/features/executions';
import { workflowsApi } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { useBuilderStateContext } from '../builder-hooks';
import { textMentionUtils } from '../connector-properties/text-input-with-mentions/text-input-utils';

import { workflowCanvasUtils } from './utils/workflow-canvas-utils';

const useSetSocketListener = (refetchConnector: () => void) => {
  const socket = useSocket();
  const [run] = useBuilderStateContext((state) => [state.run]);
  useEffect(() => {
    socket.on(WebsocketClientEvent.REFRESH_CONNECTOR, () => {
      refetchConnector();
    });
    return () => {
      socket.removeAllListeners(WebsocketClientEvent.REFRESH_CONNECTOR);
    };
  }, [socket.id, run?.id]);
};

const useListenToExistingRun = () => {
  const [run, setRun, workflowVersion] = useBuilderStateContext((state) => [
    state.run,
    state.setRun,
    state.workflowVersion,
  ]);
  const location = useLocation();
  const inRunsPage = location.pathname?.includes('/runs');
  useQuery({
    queryKey: ['refetched-run', run?.id],
    queryFn: async () => {
      if (isNil(run)) {
        return null;
      }
      const execution = await executionsApi.getPopulated(run.id);
      setRun(execution, workflowVersion);
    },
    enabled:
      !isNil(run) &&
      run.environment === RunEnvironment.PRODUCTION &&
      !isExecutionStateTerminal({
        status: run.status,
        ignoreInternalError: false,
      }) &&
      inRunsPage,
    refetchInterval: 5000,
  });
};

const useShowBuilderIsSavingWarningBeforeLeaving = () => {
  const {
    embedState: { isEmbedded },
  } = useEmbedding();
  const isSaving = useBuilderStateContext((state) => state.saving);
  useEffect(() => {
    if (isEmbedded) {
      return;
    }
    const message = t(
      'Leaving this page while saving will discard your changes, are you sure you want to leave?',
    );
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSaving) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    if (isSaving) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isSaving, isEmbedded]);
};

export const useSwitchToDraft = () => {
  const [workflowVersion, setVersion, clearRun, setWorkflow] =
    useBuilderStateContext((state) => [
      state.workflowVersion,
      state.setVersion,
      state.clearRun,
      state.setWorkflow,
    ]);
  const socket = useSocket();
  const { checkAccess } = useAuthorization();
  const userHasPermissionToEditWorkflow = checkAccess(
    Permission.WRITE_WORKFLOW,
  );

  const { mutate: switchToDraft, isPending: isSwitchingToDraftPending } =
    useMutation({
      mutationFn: async () => {
        const workflow = await workflowsApi.get(workflowVersion.workflowId);
        return workflow;
      },
      onSuccess: (workflow) => {
        setWorkflow(workflow);
        setVersion(workflow.version);
        clearRun(userHasPermissionToEditWorkflow);
        socket.removeAllListeners(WebsocketClientEvent.UPDATE_RUN_PROGRESS);
      },
      // surface the failure instead of silently keeping a stale draft, which
      // matters most on the lock take-over path where the refresh replaces a
      // full-page reload
      onError: () => internalErrorToast(),
    });
  return {
    switchToDraft,
    isSwitchingToDraftPending,
  };
};

const useIsFocusInsideListMapperModeInput = ({
  containerRef,
  setIsFocusInsideListMapperModeInput,
  isFocusInsideListMapperModeInput,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  setIsFocusInsideListMapperModeInput: (
    isFocusInsideListMapperModeInput: boolean,
  ) => void;
  isFocusInsideListMapperModeInput: boolean;
}) => {
  useEffect(() => {
    const focusInListener = () => {
      const focusedElement = document.activeElement;
      const isFocusedInside = !!containerRef.current?.contains(focusedElement);
      const isFocusedInsideDataSelector =
        !isNil(document.activeElement) &&
        document.activeElement instanceof HTMLElement &&
        textMentionUtils.isDataSelectorOrChildOfDataSelector(
          document.activeElement,
        );
      setIsFocusInsideListMapperModeInput(
        isFocusedInside ||
          (isFocusedInsideDataSelector && isFocusInsideListMapperModeInput),
      );
    };
    document.addEventListener('focusin', focusInListener);
    return () => {
      document.removeEventListener('focusin', focusInListener);
    };
  }, [setIsFocusInsideListMapperModeInput, isFocusInsideListMapperModeInput]);
};
export const useFocusOnStep = () => {
  const [currentRun, selectStep, userManuallySelectedStepDuringRun] =
    useBuilderStateContext((state) => [
      state.run,
      state.selectStepByName,
      state.userManuallySelectedStepDuringRun,
    ]);

  const previousStatus = usePrevious(currentRun?.status);
  const currentStep = executionUtils.findLastStepWithStatus(
    previousStatus ?? ExecutionStatus.RUNNING,
    currentRun?.steps ?? {},
  );

  const { fitView } = useReactFlow();
  const focusCurrentStep = useDebouncedCallback(() => {
    if (userManuallySelectedStepDuringRun) {
      return;
    }
    if (!isNil(currentStep)) {
      fitView(workflowCanvasUtils.createFocusStepInGraphParams(currentStep));
      selectStep(currentStep, { fromAutoFocus: true });
    }
  }, 500);

  useEffect(() => {
    focusCurrentStep();
  }, [currentStep, selectStep, fitView, userManuallySelectedStepDuringRun]);
};

export const useResizeCanvas = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  setHasCanvasBeenInitialised: (hasCanvasBeenInitialised: boolean) => void,
) => {
  const containerSizeRef = useRef({
    width: 0,
    height: 0,
  });
  const { getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setHasCanvasBeenInitialised(true);
      const { x, y, zoom } = getViewport();
      if (containerRef.current && width !== containerSizeRef.current.width) {
        const newX = x + (width - containerSizeRef.current.width) / 2;
        setViewport({ x: newX, y, zoom });
      }
      containerSizeRef.current = {
        width,
        height,
      };
    });
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, [setViewport, getViewport]);
};

export const workflowCanvasHooks = {
  useSetSocketListener,
  useShowBuilderIsSavingWarningBeforeLeaving,
  useIsFocusInsideListMapperModeInput,
  useFocusOnStep,
  useResizeCanvas,
  useSwitchToDraft,
  useListenToExistingRun,
};
