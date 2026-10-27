import { WorkflowActionType, WorkflowTriggerType } from '@fema-ipaas/shared';

import {
  errorHandlingProps,
  ErrorSettingsAction,
} from './connector-settings/error-handling-props';

function shouldShow({
  stepType,
  isModelLoading,
  connectorAction,
  showActionErrorHandlingForm,
}: {
  stepType: WorkflowActionType | WorkflowTriggerType;
  isModelLoading: boolean;
  connectorAction: ErrorSettingsAction | undefined;
  showActionErrorHandlingForm: boolean;
}): boolean {
  if (stepType === WorkflowTriggerType.CONNECTOR) {
    return true;
  }
  if (stepType === WorkflowActionType.CONNECTOR) {
    if (isModelLoading) {
      return true;
    }
    return (
      connectorAction !== undefined &&
      errorHandlingProps.hasErrorSettings({ action: connectorAction })
    );
  }
  return showActionErrorHandlingForm;
}

function resolveActiveTab({
  requestedTab,
  errorTabVisible,
}: {
  requestedTab: string;
  errorTabVisible: boolean;
}): string {
  return requestedTab === 'error' && !errorTabVisible ? 'action' : requestedTab;
}

export const errorTabVisibility = {
  shouldShow,
  resolveActiveTab,
};
