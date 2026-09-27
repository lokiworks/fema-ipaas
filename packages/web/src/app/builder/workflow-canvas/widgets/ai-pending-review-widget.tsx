import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowTriggerType, workflowStructureUtil } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Sparkles } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';

import { useBuilderStateContext } from '../../builder-hooks';
import { ValidationTab } from '../../validation/workflow-validator';

import LargeWidgetWrapper from './large-widget-wrapper';

export function AiPendingReviewWidget() {
  const [trigger, selectedStep, selectStepByName, readonly] =
    useBuilderStateContext((state) => [
      state.workflowVersion.trigger,
      state.selectedStep,
      state.selectStepByName,
      state.readonly,
    ]);
  const pending = useMemo(
    () =>
      workflowStructureUtil
        .getAllSteps(trigger)
        .filter(
          (step) =>
            step.type !== WorkflowTriggerType.EMPTY &&
            step.settings.pendingReview === true,
        )
        .map((step) => step.name),
    [trigger],
  );
  if (pending.length === 0 || readonly) {
    return null;
  }
  const checkNext = () => {
    const currentIndex = isNil(selectedStep)
      ? -1
      : pending.indexOf(selectedStep);
    const next = pending[(currentIndex + 1) % pending.length];
    selectStepByName(next, { tab: ValidationTab.ACTION });
  };
  return (
    <LargeWidgetWrapper containerClassName="border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2 text-sm">
        <Sparkles className="size-4 text-primary" />
        <span>
          {t(
            '{count, plural, =1 {1 AI-generated step to confirm} other {# AI-generated steps to confirm}}',
            { count: pending.length },
          )}
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={checkNext}>
        {t('Check next')}
      </Button>
    </LargeWidgetWrapper>
  );
}
