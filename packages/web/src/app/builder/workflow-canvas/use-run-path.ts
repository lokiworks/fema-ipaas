import { isNil } from '@fema-ipaas/core-utils';
import {
  isExecutionStateTerminal,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { CSSProperties, useMemo } from 'react';

import { executionUtils } from '@/features/executions';

import { useBuilderStateContext } from '../builder-hooks';

import { workflowCanvasConsts } from './utils/consts';
import { EdgeRunState, RunPath, runPathUtils } from './utils/run-path';

export function useRunPath(): RunPath | null {
  const [run, loopsIndexes, trigger] = useBuilderStateContext((state) => [
    state.run,
    state.loopsIndexes,
    state.workflowVersion.trigger,
  ]);
  return useMemo(() => {
    if (isNil(run) || isNil(run.steps)) {
      return null;
    }
    const steps = run.steps;
    return runPathUtils.runPathOf({
      trigger,
      finished: isExecutionStateTerminal({
        status: run.status,
        ignoreInternalError: false,
      }),
      outputOf: (stepName) =>
        executionUtils.extractStepOutput(stepName, loopsIndexes, steps),
    });
  }, [run, loopsIndexes, trigger]);
}

export function useEdgeRunStyle({
  edgeId,
  source,
  dimOnly = false,
}: {
  edgeId: string;
  source: string;
  dimOnly?: boolean;
}): CSSProperties {
  const path = useRunPath();
  const nextStepName = useBuilderStateContext(
    (state) =>
      workflowStructureUtil.getStep(source, state.workflowVersion.trigger)
        ?.nextAction?.name ?? null,
  );
  const state = runPathUtils.edgeStateOf({
    path,
    edgeId,
    source,
    nextStepName,
  });
  return {
    strokeWidth: `${workflowCanvasConsts.LINE_WIDTH}px`,
    ...EDGE_RUN_STYLES[dimOnly && state === 'on' ? 'neutral' : state],
  };
}

const EDGE_RUN_STYLES: Record<EdgeRunState, CSSProperties> = {
  on: { stroke: 'hsl(var(--primary))' },
  off: { opacity: 0.3 },
  neutral: {},
};
