import { WorkflowAction, WorkflowTrigger } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { SIDEBAR_ID } from '@/app/components/sidebar/dashboard';
import { stepsHooks } from '@/features/connectors';

import {
  useCursorPosition,
  useCursorPositionEffect,
} from '../../../state/cursor-position-context';
import { workflowCanvasConsts } from '../../utils/consts';

const StepDragOverlay = ({
  step,
}: {
  step: WorkflowAction | WorkflowTrigger;
}) => {
  const { cursorPosition } = useCursorPosition();
  const [overlayPosition, setOverlayPosition] =
    useState<typeof cursorPosition>(cursorPosition);
  const sidebar = document.getElementById(SIDEBAR_ID);
  const sidebarWidth = sidebar?.clientWidth ?? 0;
  const left = `${
    overlayPosition.x -
    workflowCanvasConsts.STEP_DRAG_OVERLAY_WIDTH / 2 -
    sidebarWidth
  }px`;
  const top = `${
    overlayPosition.y - workflowCanvasConsts.STEP_DRAG_OVERLAY_HEIGHT - 20
  }px`;
  const { stepMetadata } = stepsHooks.useStepMetadata({
    step,
  });
  useCursorPositionEffect((position) => {
    setOverlayPosition(position);
  });
  return (
    <div
      className={
        'p-4 absolute left-0 top-0 cursor-grabbing z-50  opacity-75  flex items-center justify-center rounded-2xl border border-solid border bg-background cursor-grabbing'
      }
      style={{
        left,
        top,
        height: `${workflowCanvasConsts.STEP_DRAG_OVERLAY_HEIGHT}px`,
        width: `${workflowCanvasConsts.STEP_DRAG_OVERLAY_WIDTH}px`,
        zIndex: 99999,
      }}
      id={'dragged-step-overlay'}
    >
      <img
        id={t('logo')}
        className={'object-contain left-0 right-0 static !cursor-grabbing'}
        src={step?.settings?.customLogoUrl ?? stepMetadata?.logoUrl}
        alt={t('Step Icon')}
      />
    </div>
  );
};

export default StepDragOverlay;
