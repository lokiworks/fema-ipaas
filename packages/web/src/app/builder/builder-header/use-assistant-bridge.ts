import { Permission, tryCatchSync } from '@fema-ipaas/core-utils';
import {
  CopilotChangeKind,
  CopilotProposal,
  workflowOperations,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import {
  useBuilderStateContext,
  useBuilderStore,
} from '@/app/builder/builder-hooks';
import { AssistantBuilderBridge } from '@/features/ai';
import { useAuthorization } from '@/hooks/authorization-hooks';

export function useAssistantBridge(): AssistantBuilderBridge {
  const store = useBuilderStore();
  const [readonly, selectStepByName, setHighlightedSteps, applyOperations] =
    useBuilderStateContext((state) => [
      state.readonly,
      state.selectStepByName,
      state.setHighlightedSteps,
      state.applyOperations,
    ]);
  const { checkAccess } = useAuthorization();

  const applyProposal = (proposal: CopilotProposal): string | null => {
    const current = store.getState().workflowVersion;
    const { data: next, error } = tryCatchSync(() =>
      proposal.operations.reduce(
        (version, operation) => workflowOperations.apply(version, operation),
        current,
      ),
    );
    if (error || !next) {
      return t(
        'The workflow changed after these suggestions were made. Ask again to get new suggestions.',
      );
    }
    applyOperations(proposal.operations);
    const remaining = proposal.affectedStepNames.filter(
      (name) => !!workflowStructureUtil.getStep(name, next.trigger),
    );
    setHighlightedSteps(remaining);
    const firstChanged = proposal.changes.find(
      (change) => change.kind !== CopilotChangeKind.DELETE_STEP,
    );
    if (firstChanged) {
      selectStepByName(firstChanged.stepName);
    }
    return null;
  };

  return {
    canModify: !readonly && checkAccess(Permission.WRITE_WORKFLOW),
    locateStep: (stepName: string) => {
      selectStepByName(stepName);
      setHighlightedSteps([stepName]);
    },
    highlightSteps: setHighlightedSteps,
    applyProposal,
  };
}
