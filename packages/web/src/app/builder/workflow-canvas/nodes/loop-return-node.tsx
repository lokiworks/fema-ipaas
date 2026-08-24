import { Handle, Position } from '@xyflow/react';

import { useBuilderStateContext } from '../../builder-hooks';
import { workflowCanvasConsts } from '../utils/consts';

//used purely to help calculate the loop graph width
const LoopReturnCanvasNode = () => {
  const canvasOrientation = useBuilderStateContext(
    (state) => state.canvasOrientation,
  );
  const isHorizontal = canvasOrientation === 'horizontal';
  return (
    <>
      <div
        className="bg-transparent pointer-events-none"
        style={
          isHorizontal
            ? {
                width: '1px',
                height: workflowCanvasConsts.STEP_NODE_SIZE.horizontal.height,
              }
            : {
                height: '1px',
                width:
                  workflowCanvasConsts.FEMA_NODE_SIZE.LOOP_RETURN_NODE.width,
              }
        }
      ></div>
      <Handle
        type="source"
        position={isHorizontal ? Position.Left : Position.Top}
        style={workflowCanvasConsts.HANDLE_STYLING}
      />
      <Handle
        type="target"
        position={isHorizontal ? Position.Right : Position.Bottom}
        style={workflowCanvasConsts.HANDLE_STYLING}
      />
    </>
  );
};

LoopReturnCanvasNode.displayName = 'EmptyLoopReturnCanvasNode';
export default LoopReturnCanvasNode;
