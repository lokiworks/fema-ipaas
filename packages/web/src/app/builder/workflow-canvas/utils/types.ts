import {
  WorkflowAction,
  StepLocationRelativeToParent,
  WorkflowTrigger,
  Note,
} from '@fema-ipaas/shared';
import { Edge } from '@xyflow/react';

export enum CanvasNodeType {
  STEP = 'STEP',
  ADD_BUTTON = 'ADD_BUTTON',
  BIG_ADD_BUTTON = 'BIG_ADD_BUTTON',
  GRAPH_END_WIDGET = 'GRAPH_END_WIDGET',
  GRAPH_START_WIDGET = 'GRAPH_START_WIDGET',
  /**Used for calculating the loop graph width */
  LOOP_RETURN_NODE = 'LOOP_RETURN_NODE',
  NOTE = 'NOTE',
}
export type BoundingBox = {
  width: number;
  height: number;
  left: number;
  right: number;
};

export type StepNode = {
  id: string;
  type: CanvasNodeType.STEP;
  position: {
    x: number;
    y: number;
  };
  data: {
    step: WorkflowAction | WorkflowTrigger;
  };
  selectable?: boolean;
  style?: React.CSSProperties;
  draggable?: boolean;
};

export type NoteNode = {
  id: string;
  type: CanvasNodeType.NOTE;
  position: {
    x: number;
    y: number;
  };
  data: Pick<Note, 'content' | 'ownerId' | 'color' | 'size'>;
};

export type LoopReturnNode = {
  id: string;
  type: CanvasNodeType.LOOP_RETURN_NODE;
  position: {
    x: number;
    y: number;
  };
  data: Record<string, never>;
  selectable?: boolean;
};

export type ButtonData = {
  edgeId: string;
} & (
  | {
      parentStepName: string;
      stepLocationRelativeToParent:
        | StepLocationRelativeToParent.AFTER
        | StepLocationRelativeToParent.INSIDE_LOOP
        | StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH
        | StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH;
    }
  | {
      parentStepName: string;
      stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH;
      branchIndex: number;
    }
);

export type BigAddButtonNode = {
  id: string;
  type: CanvasNodeType.BIG_ADD_BUTTON;
  position: {
    x: number;
    y: number;
  };
  data: ButtonData;
  selectable?: boolean;
  style?: React.CSSProperties;
};

export type GraphEndNode = {
  id: string;
  type: CanvasNodeType.GRAPH_END_WIDGET;
  position: {
    x: number;
    y: number;
  };
  data: {
    showWidget?: boolean;
  };
  selectable?: boolean;
};

export type CanvasNode =
  | StepNode
  | GraphEndNode
  | BigAddButtonNode
  | LoopReturnNode
  | NoteNode;

export enum CanvasEdgeType {
  STRAIGHT_LINE = 'StraightLineEdge',
  LOOP_START_EDGE = 'LoopStartEdge',
  LOOP_CLOSE_EDGE = 'LoopCloseEdge',
  LOOP_RETURN_EDGE = 'LoopReturnEdge',
  ROUTER_START_EDGE = 'RouterStartEdge',
  ROUTER_END_EDGE = 'RouterEndEdge',
  JOIN_EDGE = 'JoinEdge',
}

export type JoinEdge = Edge & {
  type: CanvasEdgeType.JOIN_EDGE;
  data: {
    from: string;
    to: string;
  };
};

export type StraightLineEdge = Edge & {
  type: CanvasEdgeType.STRAIGHT_LINE;
  data: {
    drawArrowHead: boolean;
    hideAddButton?: boolean;
    parentStepName: string;
  };
};

export type LoopStartEdge = Edge & {
  type: CanvasEdgeType.LOOP_START_EDGE;
  data: {
    isLoopEmpty: boolean;
  };
};

export type LoopCloseEdge = Edge & {
  type: CanvasEdgeType.LOOP_CLOSE_EDGE;
};

export type LoopReturnEdge = Edge & {
  type: CanvasEdgeType.LOOP_RETURN_EDGE;
  data: {
    parentStepName: string;
    isLoopEmpty: boolean;
    drawArrowHeadAfterEnd: boolean;
    verticalSpaceBetweenReturnNodeStartAndEnd: number;
  };
};

export type RouterStartEdge = Edge & {
  type: CanvasEdgeType.ROUTER_START_EDGE;
  data: {
    isBranchEmpty: boolean;
    label: string;
    drawHorizontalLine: boolean;
    drawStartingVerticalLine: boolean;
  } & (
    | {
        stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH;
        branchIndex: number;
      }
    | {
        stepLocationRelativeToParent:
          | StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH
          | StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH;
      }
  );
};

export type RouterEndEdge = Edge & {
  type: CanvasEdgeType.ROUTER_END_EDGE;
  data: {
    drawHorizontalLine: boolean;
    verticalSpaceBetweenLastNodeInBranchAndEndLine: number;
  } & (
    | {
        routerOrBranchStepName: string;
        drawEndingVerticalLine: true;
        isNextStepEmpty: boolean;
      }
    | {
        drawEndingVerticalLine: false;
      }
  );
};

export type CanvasEdge =
  | LoopStartEdge
  | LoopReturnEdge
  | StraightLineEdge
  | RouterStartEdge
  | RouterEndEdge
  | JoinEdge;
export type CanvasGraph = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export type CanvasOrientation = 'vertical' | 'horizontal';
