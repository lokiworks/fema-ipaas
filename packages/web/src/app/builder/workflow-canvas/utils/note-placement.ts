import { ReactFlowInstance } from '@xyflow/react';

import { CanvasNodeType } from './types';

function overlaps({ first, second }: { first: Rect; second: Rect }): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function inflate({ rect, margin }: { rect: Rect; margin: number }): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

function resolvePosition({
  position,
  size,
  obstacles,
}: {
  position: Point;
  size: Size;
  obstacles: Rect[];
}): Point {
  const padded = obstacles.map((rect) => inflate({ rect, margin: MARGIN }));
  const isFree = (point: Point) =>
    padded.every(
      (obstacle) =>
        !overlaps({
          first: { ...point, ...size },
          second: obstacle,
        }),
    );
  if (isFree(position)) {
    return position;
  }
  const candidates = padded
    .flatMap((obstacle) => [
      { x: obstacle.x + obstacle.width, y: position.y },
      { x: obstacle.x - size.width, y: position.y },
      { x: position.x, y: obstacle.y + obstacle.height },
      { x: position.x, y: obstacle.y - size.height },
    ])
    .filter(isFree);
  if (candidates.length === 0) {
    return position;
  }
  return candidates.reduce((nearest, candidate) =>
    distance({ from: position, to: candidate }) <
    distance({ from: position, to: nearest })
      ? candidate
      : nearest,
  );
}

function collectObstacles({
  reactFlow,
}: {
  reactFlow: ReactFlowInstance;
}): Rect[] {
  return reactFlow
    .getNodes()
    .filter((node) => node.type === CanvasNodeType.STEP)
    .map((node) => {
      const internal = reactFlow.getInternalNode(node.id);
      const position = internal?.internals.positionAbsolute ?? node.position;
      const measured = internal?.measured ?? node.measured;
      return {
        x: position.x,
        y: position.y - BADGE_HEIGHT,
        width: (measured?.width ?? 0) + LABEL_WIDTH,
        height: (measured?.height ?? 0) + BADGE_HEIGHT,
      };
    });
}

function placeAwayFromSteps({
  reactFlow,
  position,
  size,
}: {
  reactFlow: ReactFlowInstance;
  position: Point;
  size: Size;
}): Point {
  return resolvePosition({
    position,
    size,
    obstacles: collectObstacles({ reactFlow }),
  });
}

function distance({ from, to }: { from: Point; to: Point }): number {
  return (from.x - to.x) ** 2 + (from.y - to.y) ** 2;
}

export const notePlacement = { resolvePosition, placeAwayFromSteps };

const MARGIN = 12;
const BADGE_HEIGHT = 32;
const LABEL_WIDTH = 190;

type Point = { x: number; y: number };
type Size = { width: number; height: number };
type Rect = Point & Size;
