import { StepLocationRelativeToParent } from '@fema/shared';
import { BaseEdge, EdgeProps } from '@xyflow/react';

import { workflowCanvasConsts } from '../utils/consts';
import { ApRouterEndEdge } from '../utils/types';

import { ApAddButton } from './add-button';
import { useEdgeLayoutSpace } from './use-edge-layout-space';

export const ApRouterEndCanvasEdge = ({
  sourceX,
  targetX,
  targetY,
  sourceY,
  data,
  id,
}: EdgeProps & Omit<ApRouterEndEdge, 'position'>) => {
  const { isHorizontal, layout, layoutSource, layoutTarget, toCanvasPath } =
    useEdgeLayoutSpace({ sourceX, sourceY, targetX, targetY });

  // layout-space (along-axis) length: vertical on the vertical canvas,
  // horizontal on the horizontal canvas
  const endLineAlongLength =
    layout.spaceAlongBetweenSteps -
    2 * workflowCanvasConsts.VERTICAL_SPACE_BETWEEN_STEP_AND_LINE;

  const horizontalLineLength =
    (Math.abs(layoutTarget.x - layoutSource.x) -
      2 * workflowCanvasConsts.ARC_LENGTH) *
    (layoutTarget.x > layoutSource.x ? 1 : -1);

  const distanceBetweenTargetAndSource = Math.abs(
    layoutTarget.x - layoutSource.x,
  );

  const generateLayoutPath = () => {
    // Start point
    let path = `M ${layoutSource.x - 0.5} ${
      layoutSource.y - workflowCanvasConsts.VERTICAL_SPACE_BETWEEN_STEP_AND_LINE
    }`;

    // Vertical line from start
    path += `v ${data.verticalSpaceBetweenLastNodeInBranchAndEndLine}`;

    // Arc or vertical line based on distance
    if (distanceBetweenTargetAndSource >= workflowCanvasConsts.ARC_LENGTH) {
      path +=
        layoutTarget.x > layoutSource.x
          ? workflowCanvasConsts.ARC_RIGHT_DOWN
          : workflowCanvasConsts.ARC_LEFT_DOWN;
    } else {
      path += `v ${
        workflowCanvasConsts.ARC_LENGTH +
        workflowCanvasConsts.VERTICAL_SPACE_BETWEEN_STEP_AND_LINE +
        2
      }`;
    }

    // Optional horizontal line
    if (data.drawHorizontalLine) {
      path += `h ${horizontalLineLength} ${
        layoutTarget.x > layoutSource.x
          ? workflowCanvasConsts.ARC_RIGHT
          : workflowCanvasConsts.ARC_LEFT
      }`;
    }

    // Optional ending vertical line with arrow
    if (data.drawEndingVerticalLine) {
      path += `v${endLineAlongLength}`;
      if (!data.isNextStepEmpty) {
        path += workflowCanvasConsts.ARROW_DOWN;
      }
    }

    return path;
  };

  const layoutPath = generateLayoutPath();
  const path = toCanvasPath(layoutPath);

  const buttonPosition = isHorizontal
    ? {
        x: targetX - endLineAlongLength,
        y:
          targetY -
          workflowCanvasConsts.FEMA_NODE_SIZE.ADD_BUTTON.height / 2 -
          workflowCanvasConsts.LINE_WIDTH / 2,
      }
    : {
        x:
          targetX -
          workflowCanvasConsts.FEMA_NODE_SIZE.ADD_BUTTON.width / 2 -
          workflowCanvasConsts.LINE_WIDTH / 2,
        y: targetY - endLineAlongLength,
      };

  return (
    <>
      <BaseEdge
        path={path}
        style={{ strokeWidth: `${workflowCanvasConsts.LINE_WIDTH}px` }}
      />

      {data.drawEndingVerticalLine && (
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
            parentStepName={data.routerOrBranchStepName}
          />
        </foreignObject>
      )}
    </>
  );
};
