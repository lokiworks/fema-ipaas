import { isNil } from '@fema-ipaas/core-utils';
import { workflowStructureUtil } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { pathHelpers } from '@/app/builder/data-selector/path-helpers';
import { workflowCanvasConsts } from '@/app/builder/workflow-canvas/utils/consts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

import { referenceFields } from './reference-fields';

export function ReferenceDragLayer() {
  const [referenceDrag, setReferenceDrag, setReferencePick] =
    useBuilderStateContext((state) => [
      state.referenceDrag,
      state.setReferenceDrag,
      state.setReferencePick,
    ]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isNil(referenceDrag)) {
      return;
    }
    const handleMove = (event: PointerEvent) =>
      setCursor({ x: event.clientX, y: event.clientY });
    const handleUp = (event: PointerEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const stepElement = element?.closest(
        `[data-${workflowCanvasConsts.STEP_CONTEXT_MENU_ATTRIBUTE}]`,
      );
      const stepName = stepElement?.getAttribute(
        `data-${workflowCanvasConsts.STEP_CONTEXT_MENU_ATTRIBUTE}`,
      );
      setReferenceDrag(null);
      setCursor(null);
      if (isNil(stepName)) {
        return;
      }
      if (!referenceDrag.allowedStepNames.includes(stepName)) {
        toast(
          t(
            'You can only connect to upstream steps, and steps in different branches cannot use each other’s data',
          ),
        );
        return;
      }
      setReferencePick({
        targetStepName: stepName,
        candidateStepNames: referenceDrag.allowedStepNames,
        insert: referenceDrag.insert,
      });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [referenceDrag, setReferenceDrag, setReferencePick]);

  return (
    <>
      {referenceDrag && cursor && (
        <svg className="pointer-events-none fixed inset-0 z-[60] size-full">
          <line
            x1={referenceDrag.origin.x}
            y1={referenceDrag.origin.y}
            x2={cursor.x}
            y2={cursor.y}
            className="stroke-primary"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          <circle cx={cursor.x} cy={cursor.y} r={4} className="fill-primary" />
        </svg>
      )}
      <ReferencePickDialog />
    </>
  );
}

function ReferencePickDialog() {
  const [referencePick, setReferencePick] = useBuilderStateContext((state) => [
    state.referencePick,
    state.setReferencePick,
  ]);
  const close = () => setReferencePick(null);
  return (
    <Dialog
      open={!isNil(referencePick)}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {!isNil(referencePick) &&
          (isNil(referencePick.targetStepName) ? (
            <StepChoice
              candidateStepNames={referencePick.candidateStepNames}
              onChoose={(stepName) =>
                setReferencePick({ ...referencePick, targetStepName: stepName })
              }
            />
          ) : (
            <FieldChoice
              stepName={referencePick.targetStepName}
              onPick={(propertyPath) => {
                referencePick.insert(propertyPath);
                close();
              }}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

function StepChoice({
  candidateStepNames,
  onChoose,
}: {
  candidateStepNames: string[];
  onChoose: (stepName: string) => void;
}) {
  const [trigger, selectedStep] = useBuilderStateContext((state) => [
    state.workflowVersion.trigger,
    state.selectedStep,
  ]);
  const steps = (
    isNil(selectedStep)
      ? []
      : workflowStructureUtil.findReferenceableSteps(trigger, selectedStep)
  ).filter((step) => candidateStepNames.includes(step.name));
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('Pick an upstream step to reference')}</DialogTitle>
        <DialogDescription>
          {t(
            'Same as dragging the dot next to the input onto a step on the canvas. Pick the step first, then one of its output fields.',
          )}
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="max-h-80">
        <div className="flex flex-col gap-0.5" data-testid="reference-steps">
          {steps.map((step) => (
            <Button
              key={step.name}
              type="button"
              variant="ghost"
              className="justify-start"
              onClick={() => onChoose(step.name)}
            >
              {step.dfsIndex + 1}. {step.displayName}
            </Button>
          ))}
        </div>
      </ScrollArea>
    </>
  );
}

function FieldChoice({
  stepName,
  onPick,
}: {
  stepName: string;
  onPick: (propertyPath: string) => void;
}) {
  const [trigger, outputSampleData] = useBuilderStateContext((state) => [
    state.workflowVersion.trigger,
    state.outputSampleData,
  ]);
  const [query, setQuery] = useState('');
  const step = workflowStructureUtil.getStep(stepName, trigger);
  const fields = useMemo(
    () => referenceFields.flatten(outputSampleData[stepName]),
    [stepName, outputSampleData],
  );
  const visible = fields.filter((field) =>
    field.path.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const pick = (path: string | null) =>
    onPick(
      isNil(path)
        ? pathHelpers.propertyPathStarter(stepName)
        : pathHelpers.convertValuePathToPropertyPath(stepName, path),
    );
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t('Pick an output field of {name}', {
            name: step?.displayName ?? '',
          })}
        </DialogTitle>
        <DialogDescription>
          {fields.length === 0
            ? t(
                'This step has no sample output yet. Test it to pick a field, or use its whole output.',
              )
            : t('The reference is inserted where you started dragging.')}
        </DialogDescription>
      </DialogHeader>
      {fields.length > 0 && (
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('Search fields')}
        />
      )}
      <ScrollArea className="max-h-80">
        <div className="flex flex-col gap-0.5">
          <Button
            type="button"
            variant="ghost"
            className="justify-start"
            onClick={() => pick(null)}
          >
            {t('Whole output')}
          </Button>
          {visible.map((field) => (
            <button
              key={field.path}
              type="button"
              onClick={() => pick(field.path)}
              className="flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span className="min-w-0 truncate font-mono text-xs">
                {field.path}
              </span>
              <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
                {field.preview}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </>
  );
}
