import { LeftSideBarType } from '@/app/builder/types';
import { leftPanelShift } from '@/app/builder/workflow-canvas/utils/left-panel-shift';

describe('leftPanelShift', () => {
  it('shifts for the runs and versions panels only', () => {
    const runs = leftPanelShift.shiftFor({
      sidebar: LeftSideBarType.RUNS,
      panelWidth: 440,
    });
    const versions = leftPanelShift.shiftFor({
      sidebar: LeftSideBarType.VERSIONS,
      panelWidth: 360,
    });
    expect(runs).toBeGreaterThan(0);
    expect(versions).toBeGreaterThan(0);
    expect(runs).toBeGreaterThan(versions);
    expect(
      leftPanelShift.shiftFor({
        sidebar: LeftSideBarType.NONE,
        panelWidth: 0,
      }),
    ).toBe(0);
    expect(
      leftPanelShift.shiftFor({
        sidebar: LeftSideBarType.SEARCH,
        panelWidth: 260,
      }),
    ).toBe(0);
  });

  it('applies the full shift when the canvas mounts with a panel already open', () => {
    const desired = leftPanelShift.shiftFor({
      sidebar: LeftSideBarType.RUNS,
      panelWidth: 440,
    });
    expect(leftPanelShift.deltaToApply({ desired, applied: 0 })).toBe(desired);
  });

  it('undoes only what it applied when the panel closes', () => {
    const applied = leftPanelShift.shiftFor({
      sidebar: LeftSideBarType.RUNS,
      panelWidth: 440,
    });
    expect(leftPanelShift.deltaToApply({ desired: 0, applied })).toBe(-applied);
  });

  it('moves between two panels by the difference', () => {
    const runs = leftPanelShift.shiftFor({
      sidebar: LeftSideBarType.RUNS,
      panelWidth: 440,
    });
    const versions = leftPanelShift.shiftFor({
      sidebar: LeftSideBarType.VERSIONS,
      panelWidth: 360,
    });
    expect(
      leftPanelShift.deltaToApply({ desired: versions, applied: runs }),
    ).toBe(versions - runs);
  });
});
