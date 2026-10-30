import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowTrigger,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import i18next, { t } from 'i18next';
import { Split } from 'lucide-react';

import { runPathUtils } from '../workflow-canvas/utils/run-path';

export const RouterHitSummary = ({
  step,
  output,
}: {
  step: WorkflowAction | WorkflowTrigger;
  output: unknown;
}) => {
  if (!isActionStep(step)) {
    return null;
  }
  const names = runPathUtils
    .routerHitBranchNames({ step, output })
    ?.map((name) => (name === 'Otherwise' ? t('Otherwise') : name));
  if (isNil(names)) {
    return null;
  }
  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <Split className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="min-w-0 break-words">
        {names.length === 0
          ? t('No branch matched, so none of the branches ran')
          : t('Matched branch: {names}', {
              names: new Intl.ListFormat(i18next.language, {
                type: 'conjunction',
              }).format(names),
            })}
      </span>
    </div>
  );
};

function isActionStep(
  step: WorkflowAction | WorkflowTrigger,
): step is WorkflowAction {
  return workflowStructureUtil.isAction(step.type);
}
