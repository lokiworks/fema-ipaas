import { StepLocationRelativeToParent } from '@fema-ipaas/shared';
import { BaseEdge, EdgeProps } from '@xyflow/react';

import { workflowCanvasConsts } from '../utils/consts';
import { ApLoopReturnEdge } from '../utils/types';

import { ApAddButton } from './add-button';
import { useEdgeLayoutSpace } from './use-edge-layout-space';

export const ApLoopReturnLineCanvasEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  id,
}: EdgeProps & ApLoopReturnEdge) => {
  const { isHorizontal, layout, layoutSource, layoutTarget, toCanvasPath } =
    useEdgeLayoutSpace({ sourceX, sourceY, targetX, targetY });

  const horizontalLineLength =
    Math.abs(layoutSource.x - layoutTarget.x) -
    2 * workflowCanvasConsts.ARC_LENGTH;

  const verticalLineLength = data.verticalSpaceBetweenReturnNodeStartAndEnd;
  const ARROW_RIGHT = ` m-5 -6 l6 6  m-6 0 m6 0 l-6 6 m3 -6`;
  const endLineLength =
    layout.spaceAlongBetweenSteps -
    2 * workflowCanvasConsts.VERTICAL_SPACE_BETWEEN_STEP_AND_LINE +
    8;
  const layoutPath = `
  M ${layoutSource.x - 0.5} ${
    layoutSource.y - workflowCanvasConsts.VERTICAL_SPACE_BETWEEN_STEP_AND_LINE
  }
  v 1
  ${workflowCanvasConsts.ARC_LEFT_DOWN} h -${horizontalLineLength}
  ${workflowCanvasConsts.ARC_RIGHT_UP} v -${verticalLineLength}
  a15,15 0 0,1 15,-15

  h ${horizontalLineLength / 2 - 2 * workflowCanvasConsts.ARC_LENGTH}
   ${ARROW_RIGHT}

  M ${
    layoutSource.x - workflowCanvasConsts.ARC_LENGTH - horizontalLineLength / 2
  } ${
    layoutSource.y +
    workflowCanvasConsts.VERTICAL_SPACE_BETWEEN_STEP_AND_LINE +
    workflowCanvasConsts.ARC_LENGTH / 2
  }
   v${endLineLength} ${
    data.drawArrowHeadAfterEnd ? workflowCanvasConsts.ARROW_DOWN : ''
  }
   `;
  const path = toCanvasPath(layoutPath);
  const layoutButtonPosition = {
    x:
      layoutSource.x -
      horizontalLineLength / 2 -
      workflowCanvasConsts.ARC_LENGTH -
      workflowCanvasConsts.FEMA_NODE_SIZE.ADD_BUTTON.width / 2,
    y: layoutSource.y + endLineLength / 2,
  };
  const buttonPosition = isHorizontal
    ? { x: layoutButtonPosition.y, y: layoutButtonPosition.x }
    : layoutButtonPosition;
  return (
    <>
      <BaseEdge
        path={path}
        style={{ strokeWidth: `${workflowCanvasConsts.LINE_WIDTH}px` }}
        className="relative"
      ></BaseEdge>
      {
        <foreignObject
          x={buttonPosition.x}
          y={buttonPosition.y}
          width={workflowCanvasConsts.FEMA_NODE_SIZE.ADD_BUTTON.width}
          height={workflowCanvasConsts.FEMA_NODE_SIZE.ADD_BUTTON.height}
          className="overflow-visible"
        >
          <ApAddButton
            edgeId={id}
            stepLocationRelativeToParent={StepLocationRelativeToParent.AFTER}
            parentStepName={data.parentStepName}
          ></ApAddButton>
        </foreignObject>
      }
    </>
  );
};
