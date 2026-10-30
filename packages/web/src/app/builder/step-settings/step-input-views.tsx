import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowTrigger,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { SmartOutputViewer } from '@/components/custom/smart-output-viewer';
import { cn } from '@/lib/utils';

import { useBuilderStateContext } from '../builder-hooks';
import { builtinOutputSchemas } from '../run-details/builtin-output-schemas';
import { RunStepActualInput } from '../run-details/workflow-step-input-output';

import { useStepSettingsContext } from './step-settings-context';

export function StepInputViews({
  step,
  children,
}: {
  step: WorkflowAction | WorkflowTrigger;
  children: React.ReactNode;
}) {
  const [hasRun, testInput] = useBuilderStateContext((state) => [
    !isNil(state.run),
    state.inputSampleData[step.name],
  ]);
  const canShowActual =
    !workflowStructureUtil.isTrigger(step.type) &&
    (hasRun || !isNil(testInput));
  const [view, setView] = useState<InputView>(
    hasRun ? InputView.ACTUAL : InputView.CONFIG,
  );
  if (!canShowActual) {
    return <>{children}</>;
  }
  const options = hasRun
    ? [InputView.ACTUAL, InputView.CONFIG]
    : [InputView.CONFIG, InputView.ACTUAL];
  return (
    <>
      <div
        role="tablist"
        className="inline-flex w-fit items-center gap-0.5 rounded-md bg-muted p-0.5"
      >
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={view === option}
            onClick={() => setView(option)}
            className={cn(
              'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
              view === option
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {labelOf({ view: option, hasRun })}
          </button>
        ))}
      </div>
      {view === InputView.CONFIG ? (
        children
      ) : hasRun ? (
        <RunStepActualInput step={step} />
      ) : (
        <TestActualInput step={step} input={testInput} />
      )}
    </>
  );
}

function TestActualInput({
  step,
  input,
}: {
  step: WorkflowAction | WorkflowTrigger;
  input: unknown;
}) {
  const { connectorModel } = useStepSettingsContext();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">
        {t('The values this step received in its latest test.')}
      </span>
      <SmartOutputViewer
        json={input}
        title={t('Data')}
        connectorSchema={builtinOutputSchemas.inputSchema({
          step,
          connectorModel,
          input,
        })}
      />
    </div>
  );
}

function labelOf({
  view,
  hasRun,
}: {
  view: InputView;
  hasRun: boolean;
}): string {
  if (view === InputView.CONFIG) {
    return t('Configuration');
  }
  return hasRun ? t('Run input') : t('Test input');
}

enum InputView {
  ACTUAL = 'ACTUAL',
  CONFIG = 'CONFIG',
}
