import {
  WorkflowOperationType,
  workflowCompiler,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import React, { useMemo } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { useBuilderStateContext } from '../builder-hooks';

const JoinEdgesSection = React.memo(
  ({ stepName, readonly }: { stepName: string; readonly: boolean }) => {
    const [workflowVersion, applyOperation] = useBuilderStateContext(
      (state) => [state.workflowVersion, state.applyOperation],
    );

    const joinEdges = useMemo(
      () => workflowVersion.graph?.joinEdges ?? [],
      [workflowVersion.graph],
    );
    const waitingFor = useMemo(
      () =>
        new Set(
          joinEdges
            .filter((edge) => edge.to === stepName)
            .map((edge) => edge.from),
        ),
      [joinEdges, stepName],
    );

    // A step can only wait for another step, never for the trigger: the trigger produces no step
    // output, so a join edge from it would never be satisfied and the run would stall.
    const candidates = useMemo(
      () =>
        workflowStructureUtil
          .getAllSteps(workflowVersion.trigger)
          .filter(
            (step) =>
              step.name !== stepName &&
              workflowStructureUtil.isAction(step.type),
          ),
      [workflowVersion.trigger, stepName],
    );

    const blocked = useMemo(
      () =>
        new Set(
          candidates
            .filter(
              (step) =>
                !waitingFor.has(step.name) &&
                workflowCompiler.wouldCreateCycle({
                  workflowVersion,
                  edge: { from: step.name, to: stepName },
                }),
            )
            .map((step) => step.name),
        ),
      [candidates, waitingFor, workflowVersion, stepName],
    );

    if (candidates.length === 0) {
      return null;
    }

    const toggle = (from: string) => {
      const next = waitingFor.has(from)
        ? joinEdges.filter(
            (edge) => !(edge.from === from && edge.to === stepName),
          )
        : [...joinEdges, { from, to: stepName }];
      applyOperation({
        type: WorkflowOperationType.SET_JOIN_EDGES,
        request: { joinEdges: next },
      });
    };

    return (
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex flex-col gap-1">
          <Label className="text-sm">{t('Wait for')}</Label>
          <span className="text-xs text-muted-foreground">
            {t(
              'This step will not run until every step you pick here has finished.',
            )}
          </span>
        </div>
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {candidates.map((step) => (
            <label
              key={step.name}
              title={
                blocked.has(step.name)
                  ? t(
                      'This step runs after the current one, so waiting for it would never finish',
                    )
                  : undefined
              }
              className={cn(
                'flex items-center gap-2 rounded px-1 py-1 text-sm',
                blocked.has(step.name)
                  ? 'cursor-not-allowed opacity-50'
                  : 'cursor-pointer hover:bg-muted',
              )}
            >
              <Checkbox
                checked={waitingFor.has(step.name)}
                disabled={readonly || blocked.has(step.name)}
                onCheckedChange={() => toggle(step.name)}
              />
              <span className="truncate">{step.displayName}</span>
            </label>
          ))}
        </div>
      </div>
    );
  },
);

JoinEdgesSection.displayName = 'JoinEdgesSection';
export { JoinEdgesSection };
