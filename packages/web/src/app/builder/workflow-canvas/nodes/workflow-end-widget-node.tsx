import { Handle, Position } from '@xyflow/react';

import { useBuilderStateContext } from '../../builder-hooks';
import { workflowCanvasConsts } from '../utils/consts';
import { ApGraphEndNode } from '../utils/types';
import WorkflowEndWidget from '../widgets/workflow-end-widget';

const ApGraphEndWidgetNode = ({ data }: Omit<ApGraphEndNode, 'position'>) => {
  const canvasOrientation = useBuilderStateContext(
    (state) => state.canvasOrientation,
  );
  const isHorizontal = canvasOrientation === 'horizontal';
  return (
    <>
      <div className="h-px w-px relative ">
        {data.showWidget && (
          <div
            style={
              isHorizontal
                ? { position: 'absolute', left: '28px', top: '-14px' }
                : undefined
            }
          >
            <WorkflowEndWidget></WorkflowEndWidget>
          </div>
        )}
      </div>

      <Handle
        type="target"
        position={isHorizontal ? Position.Left : Position.Top}
        style={workflowCanvasConsts.HANDLE_STYLING}
      />
      <Handle
        type="source"
        position={isHorizontal ? Position.Right : Position.Bottom}
        style={workflowCanvasConsts.HANDLE_STYLING}
      />
    </>
  );
};

ApGraphEndWidgetNode.displayName = 'ApGraphEndWidgetNode';
export default ApGraphEndWidgetNode;
