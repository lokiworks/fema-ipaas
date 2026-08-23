import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';
import { t } from 'i18next';

import { ApJoinEdge } from '../utils/types';

// Join edges cut across the tree's own lines, so they are dashed and labelled rather than drawn
// like a normal next-step edge — a reader should be able to tell at a glance that this is a
// dependency, not the flow of execution.
export const ApJoinCanvasEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps & ApJoinEdge) => {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          strokeDasharray: '4 4',
          strokeWidth: 1.5,
          stroke: 'hsl(var(--primary))',
          opacity: 0.6,
        }}
      />
      <foreignObject
        width={80}
        height={20}
        x={labelX - 40}
        y={labelY - 10}
        className="pointer-events-none overflow-visible"
      >
        <div className="flex justify-center">
          <span className="rounded bg-background px-1 text-[10px] text-muted-foreground">
            {t('waits for')}
          </span>
        </div>
      </foreignObject>
    </>
  );
};
