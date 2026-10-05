import { describe, expect, it } from 'vitest';

import { beisenChangeWindow } from '../src/lib/common/change-window';

function record({ jobNumber, department, modifiedTime }: { jobNumber: string; department: number; modifiedTime: string }): Record<string, unknown> {
  return { employeeInfo: { modifiedTime }, recordInfo: { jobNumber, oIdDepartment: department, modifiedTime } };
}

describe('beisenChangeWindow.sortByChangeTime', () => {
  it('puts one employee changes in the order they happened even when Beisen returned them shuffled', () => {
    const shuffled = [
      record({ jobNumber: 'E1', department: 7, modifiedTime: '2026-10-05 12:00:03' }),
      record({ jobNumber: 'E1', department: 3, modifiedTime: '2026-10-05 12:00:01' }),
      record({ jobNumber: 'E1', department: 5, modifiedTime: '2026-10-05 12:00:02' }),
    ];

    const ordered = beisenChangeWindow.sortByChangeTime({ records: shuffled });

    expect(ordered.map((item) => Reflect.get(Reflect.get(item, 'recordInfo'), 'oIdDepartment'))).toEqual([3, 5, 7]);
  });

  it('keeps the returned order for equal modification times and puts records without one first', () => {
    const same = [
      record({ jobNumber: 'E1', department: 1, modifiedTime: '2026-10-05 12:00:01' }),
      record({ jobNumber: 'E2', department: 2, modifiedTime: '2026-10-05 12:00:01' }),
      { recordInfo: { jobNumber: 'E3', oIdDepartment: 3 } },
    ];

    const ordered = beisenChangeWindow.sortByChangeTime({ records: same });

    expect(ordered.map((item) => Reflect.get(Reflect.get(item, 'recordInfo'), 'jobNumber'))).toEqual(['E3', 'E1', 'E2']);
  });
});
