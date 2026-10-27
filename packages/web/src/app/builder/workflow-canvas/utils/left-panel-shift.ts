import { LeftSideBarType } from '../../types';

function shiftFor({
  sidebar,
  panelWidth,
}: {
  sidebar: LeftSideBarType;
  panelWidth: number;
}): number {
  if (!SHIFTING_SIDEBARS.includes(sidebar)) {
    return 0;
  }
  return (panelWidth + CHROME_WIDTH) / 2 - STEP_LABEL_HALF_WIDTH;
}

function deltaToApply({
  desired,
  applied,
}: {
  desired: number;
  applied: number;
}): number {
  return desired - applied;
}

export const leftPanelShift = { shiftFor, deltaToApply };

const SHIFTING_SIDEBARS: LeftSideBarType[] = [
  LeftSideBarType.RUNS,
  LeftSideBarType.VERSIONS,
];
const CHROME_WIDTH = 72;
const STEP_LABEL_HALF_WIDTH = 90;
