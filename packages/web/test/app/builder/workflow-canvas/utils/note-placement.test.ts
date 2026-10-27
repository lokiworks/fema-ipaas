import { notePlacement } from '@/app/builder/workflow-canvas/utils/note-placement';

const NOTE_SIZE = { width: 150, height: 150 };
const STEP = { x: 100, y: 100, width: 250, height: 90 };

function overlaps(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
) {
  return (
    point.x < rect.x + rect.width &&
    point.x + NOTE_SIZE.width > rect.x &&
    point.y < rect.y + rect.height &&
    point.y + NOTE_SIZE.height > rect.y
  );
}

describe('notePlacement.resolvePosition', () => {
  it('keeps the position when the note touches no step', () => {
    const position = { x: 600, y: 600 };
    expect(
      notePlacement.resolvePosition({
        position,
        size: NOTE_SIZE,
        obstacles: [STEP],
      }),
    ).toEqual(position);
  });

  it('moves a note dropped on a step to a free spot', () => {
    const resolved = notePlacement.resolvePosition({
      position: { x: 150, y: 120 },
      size: NOTE_SIZE,
      obstacles: [STEP],
    });
    expect(overlaps(resolved, STEP)).toBe(false);
  });

  it('picks the nearest free spot', () => {
    const resolved = notePlacement.resolvePosition({
      position: { x: 90, y: 160 },
      size: NOTE_SIZE,
      obstacles: [STEP],
    });
    expect(resolved.x).toBe(90);
    expect(resolved.y).toBeGreaterThanOrEqual(STEP.y + STEP.height);
  });

  it('avoids every obstacle when several steps are stacked', () => {
    const second = { x: 100, y: 190, width: 250, height: 90 };
    const resolved = notePlacement.resolvePosition({
      position: { x: 150, y: 150 },
      size: NOTE_SIZE,
      obstacles: [STEP, second],
    });
    expect(overlaps(resolved, STEP)).toBe(false);
    expect(overlaps(resolved, second)).toBe(false);
  });
});
