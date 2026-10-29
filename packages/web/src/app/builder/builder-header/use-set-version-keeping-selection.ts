import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowVersion, workflowStructureUtil } from '@fema-ipaas/shared';
import { useRef } from 'react';

import { useBuilderStore } from '@/app/builder/builder-hooks';

export function useSetVersionKeepingSelection() {
  const builderStore = useBuilderStore();
  const rememberedStep = useRef<string | null>(null);
  const rememberSelection = () => {
    rememberedStep.current = builderStore.getState().selectedStep;
  };
  const setVersionKeepingSelection = (workflowVersion: WorkflowVersion) => {
    const { selectStepByName, setVersion } = builderStore.getState();
    const keptStep = rememberedStep.current;
    rememberedStep.current = null;
    const selectionGone =
      !isNil(keptStep) &&
      isNil(workflowStructureUtil.getStep(keptStep, workflowVersion.trigger));
    setVersion(workflowVersion, selectionGone);
    if (!isNil(keptStep) && !selectionGone) {
      selectStepByName(keptStep, { fromAutoFocus: true });
    }
  };
  return { rememberSelection, setVersionKeepingSelection };
}
