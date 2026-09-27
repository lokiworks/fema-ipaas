import { describe, expect, it } from 'vitest';

import {
  APP_EVENT_TRIGGER,
  NEW_WORKFLOW_TRIGGER_CHOICES,
  newWorkflowTriggerUtils,
} from '@/features/workflows/utils/new-workflow-triggers';

describe('newWorkflowTriggerUtils', () => {
  it('offers the six trigger choices in the documented order', () => {
    expect(NEW_WORKFLOW_TRIGGER_CHOICES.map((choice) => choice.value)).toEqual([
      'webhook',
      'manual',
      'schedule',
      'subflow',
      'alert',
      'form',
    ]);
  });

  it('maps each choice to a real core connector trigger', () => {
    expect(newWorkflowTriggerUtils.targetFor('webhook')).toEqual({
      connectorName: '@fema-ipaas/connector-webhook',
      triggerName: 'catch_webhook',
    });
    expect(newWorkflowTriggerUtils.targetFor('manual')).toEqual({
      connectorName: '@fema-ipaas/connector-manual-trigger',
      triggerName: 'manual_trigger',
    });
    expect(newWorkflowTriggerUtils.targetFor('schedule')?.connectorName).toBe(
      '@fema-ipaas/connector-schedule',
    );
    expect(newWorkflowTriggerUtils.targetFor('subflow')).toEqual({
      connectorName: '@fema-ipaas/connector-subflows',
      triggerName: 'callableWorkflow',
    });
    expect(newWorkflowTriggerUtils.targetFor('form')).toEqual({
      connectorName: '@fema-ipaas/connector-forms',
      triggerName: 'form_submission',
    });
  });

  it('keeps the alert trigger unavailable instead of faking it', () => {
    expect(newWorkflowTriggerUtils.targetFor('alert')).toBeNull();
    expect(newWorkflowTriggerUtils.isSelectable('alert')).toBe(false);
  });

  it('creates app-event workflows with an empty trigger', () => {
    expect(newWorkflowTriggerUtils.targetFor(APP_EVENT_TRIGGER)).toBeNull();
    expect(newWorkflowTriggerUtils.isSelectable(APP_EVENT_TRIGGER)).toBe(true);
  });
});
