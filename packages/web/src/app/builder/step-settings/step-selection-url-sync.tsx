import { isNil } from '@fema-ipaas/core-utils';
import { workflowStructureUtil } from '@fema-ipaas/shared';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useBuilderStateContext } from '../builder-hooks';

export function StepSelectionUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedStep, stepPanelTab, selectStepByName, trigger] =
    useBuilderStateContext((state) => [
      state.selectedStep,
      state.stepPanelTab,
      state.selectStepByName,
      state.workflowVersion.trigger,
    ]);
  const pendingRestore = useRef(readSelection(searchParams));

  useEffect(() => {
    const restore = pendingRestore.current;
    if (
      isNil(restore) ||
      isNil(workflowStructureUtil.getStep(restore.step, trigger))
    ) {
      pendingRestore.current = null;
      return;
    }
    selectStepByName(restore.step, {
      fromAutoFocus: true,
      tab: restore.tab ?? undefined,
    });
  }, [selectStepByName, trigger]);

  useEffect(() => {
    const restore = pendingRestore.current;
    if (!isNil(restore)) {
      if (selectedStep !== restore.step) {
        return;
      }
      pendingRestore.current = null;
    }
    const next = withSelection({
      previous: searchParams,
      step: selectedStep,
      tab: stepPanelTab,
    });
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [selectedStep, stepPanelTab, searchParams, setSearchParams]);

  return null;
}

function readSelection(
  params: URLSearchParams,
): { step: string; tab: string | null } | null {
  const step = params.get(PARAM.STEP);
  return isNil(step) ? null : { step, tab: params.get(PARAM.TAB) };
}

function withSelection({
  previous,
  step,
  tab,
}: {
  previous: URLSearchParams;
  step: string | null;
  tab: string | null;
}): URLSearchParams {
  const kept = [...previous.entries()].filter(
    ([key]) => key !== PARAM.STEP && key !== PARAM.TAB,
  );
  return new URLSearchParams([
    ...kept,
    ...(isNil(step) ? [] : [[PARAM.STEP, step]]),
    ...(isNil(tab) ? [] : [[PARAM.TAB, tab]]),
  ]);
}

const PARAM = {
  STEP: 'step',
  TAB: 'tab',
};
