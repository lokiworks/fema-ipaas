import { WorkflowActionType, WorkflowTriggerType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { joinEdgesVisibility } from '@/app/builder/step-settings/join-edges-visibility';

describe('joinEdgesVisibility.shouldShow', () => {
  it('shows the wait-for section on the action tab of a connector step', () => {
    expect(
      joinEdgesVisibility.shouldShow({
        section: 'action',
        stepType: WorkflowActionType.CONNECTOR,
      }),
    ).toBe(true);
  });

  it('keeps showing it for the built-in step types', () => {
    [
      WorkflowActionType.CODE,
      WorkflowActionType.ROUTER,
      WorkflowActionType.PARALLEL,
      WorkflowActionType.LOOP_ON_ITEMS,
    ].forEach((stepType) =>
      expect(
        joinEdgesVisibility.shouldShow({ section: 'action', stepType }),
      ).toBe(true),
    );
  });

  it('never shows it for a trigger, which has nothing to wait for', () => {
    expect(
      joinEdgesVisibility.shouldShow({
        section: 'action',
        stepType: WorkflowTriggerType.CONNECTOR,
      }),
    ).toBe(false);
  });

  it('only shows it on the action tab', () => {
    expect(
      joinEdgesVisibility.shouldShow({
        section: 'input',
        stepType: WorkflowActionType.CONNECTOR,
      }),
    ).toBe(false);
    expect(
      joinEdgesVisibility.shouldShow({
        section: 'error',
        stepType: WorkflowActionType.CONNECTOR,
      }),
    ).toBe(false);
  });
});
