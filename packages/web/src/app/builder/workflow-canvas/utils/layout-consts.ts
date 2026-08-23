import {
  WORKFLOW_CANVAS_ARC,
  WORKFLOW_CANVAS_HSPACE,
  WORKFLOW_CANVAS_LOOP_VOFFSET,
  WORKFLOW_CANVAS_ROUTER_VOFFSET,
  WORKFLOW_CANVAS_STEP_HEIGHT,
  WORKFLOW_CANVAS_STEP_WIDTH,
  WORKFLOW_CANVAS_VSPACE,
} from '@fema-ipaas/shared';

import { ApNodeType, CanvasOrientation } from './types';

const ARC_LENGTH = WORKFLOW_CANVAS_ARC;
const HORIZONTAL_LAYOUT_SPACE_BETWEEN_STEPS = 80;
const HORIZONTAL_STEP_SIZE = 80;
const HORIZONTAL_STEP_LABEL_WIDTH = 150;
// extra room on branch entry lines so the label can sit on the line next to the add button
const HORIZONTAL_BRANCH_LABEL_SPACE = 70;
// horizontal view spaces router branches 20px wider apart than vertical
const HORIZONTAL_ROUTER_BRANCH_GAP = WORKFLOW_CANVAS_HSPACE + 20;
const STEP_NODE_SIZE: Record<
  CanvasOrientation,
  { width: number; height: number }
> = {
  vertical: {
    width: WORKFLOW_CANVAS_STEP_WIDTH,
    height: WORKFLOW_CANVAS_STEP_HEIGHT,
  },
  horizontal: {
    width: HORIZONTAL_STEP_SIZE,
    height: HORIZONTAL_STEP_SIZE,
  },
};
const ORIENTATION_LAYOUT: Record<CanvasOrientation, OrientationLayout> = {
  vertical: {
    stepAlongSize: WORKFLOW_CANVAS_STEP_HEIGHT,
    stepCrossSize: WORKFLOW_CANVAS_STEP_WIDTH,
    spaceAlongBetweenSteps: WORKFLOW_CANVAS_VSPACE,
    loopOffsetAlong: WORKFLOW_CANVAS_LOOP_VOFFSET,
    routerOffsetAlong: WORKFLOW_CANVAS_ROUTER_VOFFSET,
    crossGapBetweenBranches: WORKFLOW_CANVAS_HSPACE,
    routerBranchGap: WORKFLOW_CANVAS_HSPACE,
  },
  horizontal: {
    stepAlongSize: HORIZONTAL_STEP_SIZE,
    stepCrossSize: HORIZONTAL_STEP_SIZE,
    spaceAlongBetweenSteps: HORIZONTAL_LAYOUT_SPACE_BETWEEN_STEPS,
    loopOffsetAlong:
      HORIZONTAL_LAYOUT_SPACE_BETWEEN_STEPS * 1.5 + 2 * WORKFLOW_CANVAS_ARC,
    routerOffsetAlong:
      HORIZONTAL_LAYOUT_SPACE_BETWEEN_STEPS * 1.5 +
      2 * WORKFLOW_CANVAS_ARC +
      HORIZONTAL_BRANCH_LABEL_SPACE,
    crossGapBetweenBranches: 90,
    routerBranchGap: HORIZONTAL_ROUTER_BRANCH_GAP,
  },
};

const NODE_SELECTION_RECT_CLASS_NAME = 'react-flow__nodesselection-rect';

const doesNodeAffectBoundingBoxWidth: (
  type: ApNodeType,
) => type is
  | ApNodeType.BIG_ADD_BUTTON
  | ApNodeType.STEP
  | ApNodeType.LOOP_RETURN_NODE = (type) =>
  type === ApNodeType.BIG_ADD_BUTTON ||
  type === ApNodeType.STEP ||
  type === ApNodeType.LOOP_RETURN_NODE;

export const workflowCanvasLayoutConsts = {
  ARC_LENGTH,
  ORIENTATION_LAYOUT,
  STEP_NODE_SIZE,
  HORIZONTAL_STEP_LABEL_WIDTH,
  NODE_SELECTION_RECT_CLASS_NAME,
  doesNodeAffectBoundingBox: doesNodeAffectBoundingBoxWidth,
};

type OrientationLayout = {
  stepAlongSize: number;
  stepCrossSize: number;
  spaceAlongBetweenSteps: number;
  loopOffsetAlong: number;
  routerOffsetAlong: number;
  crossGapBetweenBranches: number;
  routerBranchGap: number;
};
