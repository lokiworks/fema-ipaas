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

import { CanvasEdgeType, CanvasNodeType } from './types';

const edgeTypes = {
  [CanvasEdgeType.STRAIGHT_LINE]: StraightLineCanvasEdge,
  [CanvasEdgeType.LOOP_START_EDGE]: LoopStartCanvasEdge,
  [CanvasEdgeType.LOOP_RETURN_EDGE]: LoopReturnCanvasEdge,
  [CanvasEdgeType.ROUTER_START_EDGE]: RouterStartCanvasEdge,
  [CanvasEdgeType.ROUTER_END_EDGE]: RouterEndCanvasEdge,
  [CanvasEdgeType.JOIN_EDGE]: JoinCanvasEdge,
};

const nodeTypes = {
  [CanvasNodeType.STEP]: StepCanvasNode,
  [CanvasNodeType.LOOP_RETURN_NODE]: LoopReturnCanvasNode,
  [CanvasNodeType.BIG_ADD_BUTTON]: BigAddButtonCanvasNode,
  [CanvasNodeType.GRAPH_END_WIDGET]: GraphEndWidgetNode,
  [CanvasNodeType.NOTE]: NoteCanvasNode,
};

export const canvasElementTypes = { edgeTypes, nodeTypes };
