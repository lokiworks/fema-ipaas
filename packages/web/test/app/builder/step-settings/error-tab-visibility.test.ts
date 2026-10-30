import { WorkflowActionType, WorkflowTriggerType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { errorHandlingProps } from '@/app/builder/step-settings/connector-settings/error-handling-props';
import { errorTabVisibility } from '@/app/builder/step-settings/error-tab-visibility';

describe('errorTabVisibility.shouldShow', () => {
  it('shows run settings for connector triggers', () => {
    expect(
      errorTabVisibility.shouldShow({
        stepType: WorkflowTriggerType.CONNECTOR,
        isModelLoading: false,
        connectorAction: undefined,
        showActionErrorHandlingForm: false,
      }),
    ).toBe(true);
  });

  it('shows the tab for a connector action that owns a failure mode property', () => {
    expect(
      errorTabVisibility.shouldShow({
        stepType: WorkflowActionType.CONNECTOR,
        isModelLoading: false,
        connectorAction: {
          props: { url: {}, failureMode: {} },
          errorHandlingOptions: {
            continueOnFailure: { hide: true },
            retryOnFailure: { hide: true },
          },
        },
        showActionErrorHandlingForm: false,
      }),
    ).toBe(true);
  });

  it('hides the tab for a connector action with nothing to configure', () => {
    expect(
      errorTabVisibility.shouldShow({
        stepType: WorkflowActionType.CONNECTOR,
        isModelLoading: false,
        connectorAction: {
          props: { url: {} },
          errorHandlingOptions: {
            continueOnFailure: { hide: true },
            retryOnFailure: { hide: true },
          },
        },
        showActionErrorHandlingForm: false,
      }),
    ).toBe(false);
  });

  it('keeps the tab while the connector model is loading', () => {
    expect(
      errorTabVisibility.shouldShow({
        stepType: WorkflowActionType.CONNECTOR,
        isModelLoading: true,
        connectorAction: undefined,
        showActionErrorHandlingForm: false,
      }),
    ).toBe(true);
  });

  it('hides the tab for parallel steps and follows the form flag for code steps', () => {
    expect(
      errorTabVisibility.shouldShow({
        stepType: WorkflowActionType.PARALLEL,
        isModelLoading: false,
        connectorAction: undefined,
        showActionErrorHandlingForm: false,
      }),
    ).toBe(false);
    expect(
      errorTabVisibility.shouldShow({
        stepType: WorkflowActionType.CODE,
        isModelLoading: false,
        connectorAction: undefined,
        showActionErrorHandlingForm: true,
      }),
    ).toBe(true);
  });
});

describe('errorTabVisibility.resolveActiveTab', () => {
  it('falls back to the action tab when the error tab is hidden', () => {
    expect(
      errorTabVisibility.resolveActiveTab({
        requestedTab: 'error',
        errorTabVisible: false,
      }),
    ).toBe('action');
    expect(
      errorTabVisibility.resolveActiveTab({
        requestedTab: 'error',
        errorTabVisible: true,
      }),
    ).toBe('error');
    expect(
      errorTabVisibility.resolveActiveTab({
        requestedTab: 'input',
        errorTabVisible: false,
      }),
    ).toBe('input');
  });
});

describe('errorHandlingProps.isErrorHandlingName', () => {
  it('recognises the failure mode and idempotency key properties only', () => {
    expect(
      errorHandlingProps.isErrorHandlingName({ name: 'failureMode' }),
    ).toBe(true);
    expect(
      errorHandlingProps.isErrorHandlingName({ name: 'idempotencyKey' }),
    ).toBe(true);
    expect(errorHandlingProps.isErrorHandlingName({ name: 'url' })).toBe(false);
  });
});
