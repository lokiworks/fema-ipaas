import { WorkflowStatus } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { toggledStatusUtils } from '@/features/workflows/utils/toggled-status';

const workflow = {
  id: 'wf1',
  updated: '2026-10-01T00:00:00.000Z',
  status: WorkflowStatus.DISABLED,
};

describe('toggledStatusUtils.effectiveStatus', () => {
  it('follows the server value when nothing was toggled', () => {
    expect(
      toggledStatusUtils.effectiveStatus({ workflow, toggled: null }),
    ).toBe(WorkflowStatus.DISABLED);
  });

  it('shows the value returned by the toggle until the workflow row is refreshed', () => {
    const toggled = toggledStatusUtils.fromUpdate({
      workflow,
      updated: { status: WorkflowStatus.ENABLED },
    });
    expect(toggledStatusUtils.effectiveStatus({ workflow, toggled })).toBe(
      WorkflowStatus.ENABLED,
    );
  });

  it('drops the toggled value once the workflow row carries a newer update', () => {
    const toggled = toggledStatusUtils.fromUpdate({
      workflow,
      updated: { status: WorkflowStatus.ENABLED },
    });
    expect(
      toggledStatusUtils.effectiveStatus({
        workflow: {
          ...workflow,
          updated: '2026-10-02T00:00:00.000Z',
          status: WorkflowStatus.DISABLED,
        },
        toggled,
      }),
    ).toBe(WorkflowStatus.DISABLED);
  });

  it('never applies a toggled value to a different workflow', () => {
    const toggled = toggledStatusUtils.fromUpdate({
      workflow,
      updated: { status: WorkflowStatus.ENABLED },
    });
    expect(
      toggledStatusUtils.effectiveStatus({
        workflow: { ...workflow, id: 'wf2' },
        toggled,
      }),
    ).toBe(WorkflowStatus.DISABLED);
  });
});
