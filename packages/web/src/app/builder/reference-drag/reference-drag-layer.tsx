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
  const [referencePick, setReferencePick, trigger, outputSampleData] =
    useBuilderStateContext((state) => [
      state.referencePick,
      state.setReferencePick,
      state.workflowVersion.trigger,
      state.outputSampleData,
    ]);
  const [query, setQuery] = useState('');
  const step = isNil(referencePick)
    ? null
    : workflowStructureUtil.getStep(referencePick.targetStepName, trigger);
  const fields = useMemo(
    () =>
      isNil(referencePick)
        ? []
        : referenceFields.flatten(
            outputSampleData[referencePick.targetStepName],
          ),
    [referencePick, outputSampleData],
  );
  const visible = fields.filter((field) =>
    field.path.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const pick = (path: string | null) => {
    if (isNil(referencePick)) {
      return;
    }
    referencePick.insert(
      isNil(path)
        ? pathHelpers.propertyPathStarter(referencePick.targetStepName)
        : pathHelpers.convertValuePathToPropertyPath(
            referencePick.targetStepName,
            path,
          ),
    );
    setReferencePick(null);
    setQuery('');
  };
  return (
    <Dialog
      open={!isNil(referencePick)}
      onOpenChange={(open) => {
        if (!open) {
          setReferencePick(null);
          setQuery('');
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
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
      </DialogContent>
    </Dialog>
  );
}
