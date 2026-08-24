import {
  WORKFLOW_CANVAS_HSPACE,
  WORKFLOW_CANVAS_LOOP_VOFFSET,
  WORKFLOW_CANVAS_ROUTER_VOFFSET,
  WORKFLOW_CANVAS_STEP_HEIGHT,
  WORKFLOW_CANVAS_STEP_WIDTH,
  WORKFLOW_CANVAS_VSPACE,
  NoteColorVariant,
} from '@fema-ipaas/shared';

import { JoinCanvasEdge } from '../edges/join-edge';
import { LoopReturnLineCanvasEdge as LoopReturnCanvasEdge } from '../edges/loop-return-edge';
import { LoopStartLineCanvasEdge as LoopStartCanvasEdge } from '../edges/loop-start-edge';
import { RouterEndCanvasEdge } from '../edges/router-end-edge';
import { RouterStartCanvasEdge } from '../edges/router-start-edge';
import { StraightLineCanvasEdge } from '../edges/straight-line-edge';
import { BigAddButtonCanvasNode } from '../nodes/big-add-button-node';
import LoopReturnCanvasNode from '../nodes/loop-return-node';
import { NoteCanvasNode } from '../nodes/note-node';
import { StepCanvasNode } from '../nodes/step-node';
import GraphEndWidgetNode from '../nodes/workflow-end-widget-node';

import { workflowCanvasLayoutConsts } from './layout-consts';
import { CanvasEdgeType, CanvasNodeType } from './types';

const ARC_LENGTH = workflowCanvasLayoutConsts.ARC_LENGTH;
const ORIENTATION_LAYOUT = workflowCanvasLayoutConsts.ORIENTATION_LAYOUT;
const STEP_NODE_SIZE = workflowCanvasLayoutConsts.STEP_NODE_SIZE;
const HORIZONTAL_STEP_LABEL_WIDTH =
  workflowCanvasLayoutConsts.HORIZONTAL_STEP_LABEL_WIDTH;
const ARC_LEFT = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,0 -${ARC_LENGTH},${ARC_LENGTH}`;
const ARC_RIGHT = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,1 ${ARC_LENGTH},${ARC_LENGTH}`;
const ARC_LEFT_DOWN = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,1 -${ARC_LENGTH},${ARC_LENGTH}`;
const ARC_RIGHT_DOWN = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,0 ${ARC_LENGTH},${ARC_LENGTH}`;
const ARC_RIGHT_UP = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,1 -${ARC_LENGTH},-${ARC_LENGTH}`;
const ARC_LEFT_UP = `a-${ARC_LENGTH},-${ARC_LENGTH} 0 0,0 ${ARC_LENGTH},-${ARC_LENGTH}`;
const ARROW_DOWN = 'm6 -6 l-6 6 m-6 -6 l6 6';
const VERTICAL_SPACE_BETWEEN_STEP_AND_LINE = 7;
const VERTICAL_SPACE_BETWEEN_STEPS = WORKFLOW_CANVAS_VSPACE;
const VERTICAL_OFFSET_BETWEEN_LOOP_AND_CHILD = WORKFLOW_CANVAS_LOOP_VOFFSET;
const LABEL_HEIGHT = 30;
const LABEL_VERTICAL_PADDING = 12;
const STEP_DRAG_OVERLAY_WIDTH = 75;
const STEP_DRAG_OVERLAY_HEIGHT = 75;
const NOTE_CREATION_OVERLAY_WIDTH = 150;
const NOTE_CREATION_OVERLAY_HEIGHT = 150;
const VERTICAL_OFFSET_BETWEEN_ROUTER_AND_CHILD = WORKFLOW_CANVAS_ROUTER_VOFFSET;
const LINE_WIDTH = 1.5;
const DRAGGED_STEP_TAG = 'dragged-step';
const DRAGGED_NOTE_TAG = 'dragged-note';
const HORIZONTAL_SPACE_BETWEEN_NODES = WORKFLOW_CANVAS_HSPACE;
const FEMA_NODE_SIZE: Record<
  Exclude<
    CanvasNodeType,
    CanvasNodeType.GRAPH_START_WIDGET | CanvasNodeType.NOTE
  >,
  { height: number; width: number }
> = {
  [CanvasNodeType.BIG_ADD_BUTTON]: {
    height: 50,
    width: 50,
  },
  [CanvasNodeType.ADD_BUTTON]: {
    height: 20,
    width: 20,
  },
  [CanvasNodeType.STEP]: {
    height: WORKFLOW_CANVAS_STEP_HEIGHT,
    width: WORKFLOW_CANVAS_STEP_WIDTH,
  },
  [CanvasNodeType.LOOP_RETURN_NODE]: {
    height: WORKFLOW_CANVAS_STEP_HEIGHT,
    width: WORKFLOW_CANVAS_STEP_WIDTH,
  },
  [CanvasNodeType.GRAPH_END_WIDGET]: {
    height: 0,
    width: 0,
  },
};

export const workflowCanvasConsts = {
  ARC_LENGTH,
  ORIENTATION_LAYOUT,
  STEP_NODE_SIZE,
  HORIZONTAL_STEP_LABEL_WIDTH,
  ARC_LEFT,
  ARC_RIGHT,
  ARC_LEFT_DOWN,
  ARC_RIGHT_DOWN,
  VERTICAL_OFFSET_BETWEEN_LOOP_AND_CHILD,
  FEMA_NODE_SIZE,
  VERTICAL_SPACE_BETWEEN_STEP_AND_LINE,
  ARROW_DOWN,
  VERTICAL_SPACE_BETWEEN_STEPS,
  ARC_RIGHT_UP,
  LINE_WIDTH,
  LABEL_HEIGHT,
  ARC_LEFT_UP,
  VERTICAL_OFFSET_BETWEEN_ROUTER_AND_CHILD,

  doesNodeAffectBoundingBox:
    workflowCanvasLayoutConsts.doesNodeAffectBoundingBox,
  edgeTypes: {
    [CanvasEdgeType.STRAIGHT_LINE]: StraightLineCanvasEdge,
    [CanvasEdgeType.LOOP_START_EDGE]: LoopStartCanvasEdge,
    [CanvasEdgeType.LOOP_RETURN_EDGE]: LoopReturnCanvasEdge,
    [CanvasEdgeType.ROUTER_START_EDGE]: RouterStartCanvasEdge,
    [CanvasEdgeType.ROUTER_END_EDGE]: RouterEndCanvasEdge,
    [CanvasEdgeType.JOIN_EDGE]: JoinCanvasEdge,
  },
  nodeTypes: {
    [CanvasNodeType.STEP]: StepCanvasNode,
    [CanvasNodeType.LOOP_RETURN_NODE]: LoopReturnCanvasNode,
    [CanvasNodeType.BIG_ADD_BUTTON]: BigAddButtonCanvasNode,
    [CanvasNodeType.GRAPH_END_WIDGET]: GraphEndWidgetNode,
    [CanvasNodeType.NOTE]: NoteCanvasNode,
  },
  DRAGGED_STEP_TAG,
  DRAGGED_NOTE_TAG,
  HORIZONTAL_SPACE_BETWEEN_NODES,
  HANDLE_STYLING: { opacity: 0, cursor: 'default' },
  LABEL_VERTICAL_PADDING,
  STEP_DRAG_OVERLAY_WIDTH,
  STEP_DRAG_OVERLAY_HEIGHT,
  NOTE_CREATION_OVERLAY_WIDTH,
  NOTE_CREATION_OVERLAY_HEIGHT,
  STEP_CONTEXT_MENU_ATTRIBUTE: 'step-context-menu',
  SELECTION_RECT_CHEVRON_ATTRIBUTE: 'selection-rect-chevron',
  NODE_SELECTION_RECT_CLASS_NAME:
    workflowCanvasLayoutConsts.NODE_SELECTION_RECT_CLASS_NAME,
  SIDEBAR_ANIMATION_DURATION: 200,
  DEFAULT_NOTE_CONTENT: '<br>',
  DEFAULT_NOTE_COLOR: NoteColorVariant.BLUE,
  BUILDER_HEADER_HEIGHT: 60,
};
