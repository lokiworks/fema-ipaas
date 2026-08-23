import { StepLocationRelativeToParent } from '@fema/shared';
import { BaseEdge, EdgeProps } from '@xyflow/react';

import { workflowCanvasConsts } from '../utils/consts';
import { ApStraightLineEdge } from '../utils/types';

import { ApAddButton } from './add-button';
import { useEdgeLayoutSpace } from './use-edge-layout-space';

export const ApStraightLineCanvasEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  id,
}: EdgeProps & ApStraightLineEdge) => {
  const { layoutSource, layoutTarget, toCanvasPath } = useEdgeLayoutSpace({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const lineLength = layoutTarget.y - layoutSource.y;
  const layoutPath = `M ${layoutSource.x} ${layoutSource.y} v${lineLength}
   ${data.drawArrowHead ? workflowCanvasConsts.ARROW_DOWN : ''}`;
  const path = toCanvasPath(layoutPath);
  const buttonCenter = {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2,
  };

  return (
    <>
      <BaseEdge
        path={path}
        style={{ strokeWidth: `${workflowCanvasConsts.LINE_WIDTH}px` }}
      />
      {!data.hideAddButton && (
        <foreignObject
          x={
            buttonCenter.x -
            workflowCanvasConsts.FEMA_NODE_SIZE.ADD_BUTTON.width / 2
          }
          y={
            buttonCenter.y -
            workflowCanvasConsts.FEMA_NODE_SIZE.ADD_BUTTON.height / 2
          }
          width={workflowCanvasConsts.FEMA_NODE_SIZE.ADD_BUTTON.width}
          height={workflowCanvasConsts.FEMA_NODE_SIZE.ADD_BUTTON.height}
          className="overflow-visible cursor-default"
        >
          <ApAddButton
            edgeId={id}
            parentStepName={data.parentStepName}
            stepLocationRelativeToParent={StepLocationRelativeToParent.AFTER}
          ></ApAddButton>
        </foreignObject>
      )}
    </>
  );
};
