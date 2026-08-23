import { describe, it, expect } from 'vitest';

import { workflowCanvasLayoutConsts } from '@/app/builder/workflow-canvas/utils/layout-consts';

describe('workflowCanvasLayoutConsts', () => {
  it('keeps horizontal step labels narrower than the node center-to-center distance so adjacent labels cannot overlap', () => {
    const { stepAlongSize, spaceAlongBetweenSteps } =
      workflowCanvasLayoutConsts.ORIENTATION_LAYOUT.horizontal;
    const centerToCenterDistance = stepAlongSize + spaceAlongBetweenSteps;

    expect(workflowCanvasLayoutConsts.HORIZONTAL_STEP_LABEL_WIDTH).toBeLessThan(
      centerToCenterDistance,
    );
  });
});
