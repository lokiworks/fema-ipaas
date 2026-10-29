import {
  ActionErrorHandlingOptions,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTriggerType,
  WorkflowVersion,
  WorkflowVersionState,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { stepTestRelevance } from '@/app/builder/state/step-test-relevance';

const TESTED_AT = '2026-05-02T00:00:00.000Z';
const EDITED_AT = '2026-05-03T00:00:00.000Z';
const SAMPLE = { sampleDataFileId: 'file-1', lastTestDate: TESTED_AT };

function connectorStep({
  url = 'https://example.com',
  errorHandlingOptions,
  lastUpdatedDate = TESTED_AT,
  sampleData,
}: {
  url?: string;
  errorHandlingOptions?: ActionErrorHandlingOptions;
  lastUpdatedDate?: string;
  sampleData?: typeof SAMPLE;
}): WorkflowAction {
  return {
    name: 'http_1',
    type: WorkflowActionType.CONNECTOR,
    valid: true,
    displayName: 'Send HTTP request',
    lastUpdatedDate,
    settings: {
      connectorName: '@fema-ipaas/connector-http',
      connectorVersion: '0.0.1',
      actionName: 'send_request',
      input: { url },
      propertySettings: {},
      errorHandlingOptions,
      sampleData,
    },
  };
}

function versionWith(step: WorkflowAction): WorkflowVersion {
  return {
    id: 'v1',
    created: TESTED_AT,
    updated: TESTED_AT,
    workflowId: 'w1',
    displayName: 'Flow',
    valid: true,
    state: WorkflowVersionState.DRAFT,
    updatedBy: null,
    agentIds: [],
    connectionIds: [],
    notes: [],
    schemaVersion: null,
    backupFiles: null,
    trigger: {
      name: 'trigger',
      type: WorkflowTriggerType.EMPTY,
      valid: true,
      displayName: 'Trigger',
      lastUpdatedDate: TESTED_AT,
      settings: {},
      nextAction: step,
    },
  };
}

const RETRY = {
  continueOnFailure: { value: false },
  retryOnFailure: { value: true },
};

describe('stepTestRelevance', () => {
  it('treats an error handling change as not affecting the output', () => {
    expect(
      stepTestRelevance.isSameForTesting({
        before: connectorStep({}),
        after: connectorStep({ errorHandlingOptions: RETRY }),
      }),
    ).toBe(true);
    expect(stepTestRelevance.signatureOf(connectorStep({}))).toBe(
      stepTestRelevance.signatureOf(
        connectorStep({ errorHandlingOptions: RETRY }),
      ),
    );
  });

  it('treats an input change as affecting the output', () => {
    expect(
      stepTestRelevance.isSameForTesting({
        before: connectorStep({}),
        after: connectorStep({ url: 'https://other.example.com' }),
      }),
    ).toBe(false);
  });

  it('keeps the tested date when only error handling changed', () => {
    const kept = stepTestRelevance.keepTestedSteps({
      workflowVersion: versionWith(
        connectorStep({ errorHandlingOptions: RETRY, lastUpdatedDate: EDITED_AT }),
      ),
      source: versionWith(connectorStep({ sampleData: SAMPLE })),
    });
    const step = workflowStructureUtil.getStep('http_1', kept.trigger);
    expect(step?.lastUpdatedDate).toBe(TESTED_AT);
    expect(step?.settings.sampleData).toEqual(SAMPLE);
  });

  it('lets a real input change mark the step as edited', () => {
    const kept = stepTestRelevance.keepTestedSteps({
      workflowVersion: versionWith(
        connectorStep({
          url: 'https://other.example.com',
          lastUpdatedDate: EDITED_AT,
          sampleData: SAMPLE,
        }),
      ),
      source: versionWith(connectorStep({ sampleData: SAMPLE })),
    });
    expect(
      workflowStructureUtil.getStep('http_1', kept.trigger)?.lastUpdatedDate,
    ).toBe(EDITED_AT);
  });
});
