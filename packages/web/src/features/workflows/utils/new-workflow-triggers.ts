function findChoice(value: NewWorkflowTriggerValue): NewWorkflowTriggerChoice {
  return (
    NEW_WORKFLOW_TRIGGER_CHOICES.find((choice) => choice.value === value) ??
    NEW_WORKFLOW_TRIGGER_CHOICES[0]
  );
}

function targetFor(
  value: NewWorkflowTriggerValue,
): NewWorkflowTriggerTarget | null {
  if (value === APP_EVENT_TRIGGER) {
    return null;
  }
  return findChoice(value).target;
}

function isSelectable(value: NewWorkflowTriggerValue): boolean {
  if (value === APP_EVENT_TRIGGER) {
    return true;
  }
  return findChoice(value).target !== null;
}

export const newWorkflowTriggerUtils = {
  findChoice,
  targetFor,
  isSelectable,
};

export const APP_EVENT_TRIGGER = 'appEvent';

export const NEW_WORKFLOW_TRIGGER_CHOICES: NewWorkflowTriggerChoice[] = [
  {
    value: 'webhook',
    labelKey: 'Webhook trigger',
    descriptionKey: 'Receive events from other services through a URL',
    target: {
      connectorName: '@fema-ipaas/connector-webhook',
      triggerName: 'catch_webhook',
    },
  },
  {
    value: 'manual',
    labelKey: 'Manual trigger',
    descriptionKey: 'Start the workflow by hand while testing',
    target: {
      connectorName: '@fema-ipaas/connector-manual-trigger',
      triggerName: 'manual_trigger',
    },
  },
  {
    value: 'schedule',
    labelKey: 'Scheduled trigger',
    descriptionKey: 'Run the workflow on a schedule you define',
    target: {
      connectorName: '@fema-ipaas/connector-schedule',
      triggerName: 'every_x_minutes',
    },
  },
  {
    value: 'subflow',
    labelKey: 'Subflow trigger',
    descriptionKey: 'Called by the Call subflow step of another workflow',
    target: {
      connectorName: '@fema-ipaas/connector-subflows',
      triggerName: 'callableWorkflow',
    },
  },
  {
    value: 'alert',
    labelKey: 'Alert trigger',
    descriptionKey: 'Runs when a monitoring alert fires',
    target: null,
  },
  {
    value: 'form',
    labelKey: 'Form trigger',
    descriptionKey: 'Runs when someone submits a form',
    target: {
      connectorName: '@fema-ipaas/connector-forms',
      triggerName: 'form_submission',
    },
  },
];

export type NewWorkflowTriggerTarget = {
  connectorName: string;
  triggerName: string;
};

export type NewWorkflowTriggerChoice = {
  value: string;
  labelKey: string;
  descriptionKey: string;
  target: NewWorkflowTriggerTarget | null;
};

export type NewWorkflowTriggerValue = string;
