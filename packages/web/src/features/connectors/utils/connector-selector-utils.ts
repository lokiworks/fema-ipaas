import {
  ConnectorAuthProperty,
  ConnectorPropertyMap,
  connectorPropertiesUtils,
} from '@fema-ipaas/connector-sdk';
import {
  deepMergeAndCast,
  isNil,
  isManualConnectorTrigger,
} from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  BranchOperator,
  CodeAction,
  ComponentAction,
  ConnectorAction,
  ConnectorTrigger,
  WorkflowTrigger,
  BranchExecutionType,
  RouterExecutionType,
  workflowStructureUtil,
  StepSettings,
  RouterActionSettingsWithValidation,
  WorkflowTriggerType,
  PropertyExecutionType,
  DEFAULT_SAMPLE_DATA_SETTINGS,
  WorkflowVersion,
  WorkflowOperationType,
  AUTHENTICATION_PROPERTY_NAME,
} from '@fema-ipaas/shared';
import { useRef } from 'react';

import {
  ConnectorSelectorItem,
  ConnectorSelectorOperation,
  ConnectorSelectorConnectorItem,
  ConnectorStepMetadataWithSuggestions,
} from '@/features/connectors/types';

import { formUtils } from './form-utils';
const defaultCode = `export const code = async (inputs) => {
  return true;
};`;

const removeHiddenActions = (
  connectorMetadata: ConnectorStepMetadataWithSuggestions,
) => {
  const actions = Object.values(connectorMetadata.suggestedActions ?? {});
  return actions;
};

const isConnectorActionOrTrigger = (
  connectorSelectorItem: ConnectorSelectorItem,
): connectorSelectorItem is ConnectorSelectorConnectorItem => {
  return (
    connectorSelectorItem.type === WorkflowActionType.CONNECTOR ||
    (workflowStructureUtil.isTrigger(connectorSelectorItem.type) &&
      connectorSelectorItem.type === WorkflowTriggerType.CONNECTOR)
  );
};

const isConnectorStepInputValid = ({
  props,
  auth,
  input,
  requireAuth,
}: {
  props: ConnectorPropertyMap;
  auth: ConnectorAuthProperty | ConnectorAuthProperty[] | undefined;
  input: Record<string, unknown>;
  requireAuth: boolean;
}): boolean => {
  const schema = connectorPropertiesUtils.buildSchema(props, auth);
  const hasAuth = !isNil(auth);
  const authValid =
    !requireAuth || !hasAuth || !isNil(input[AUTHENTICATION_PROPERTY_NAME]);
  return schema.safeParse(input).success && authValid;
};

const isStepInitiallyValid = (
  connectorSelectorItem: ConnectorSelectorItem,
  overrideDefaultSettings?: StepSettings,
) => {
  switch (connectorSelectorItem.type) {
    case WorkflowActionType.CODE:
      return true;
    case WorkflowActionType.CONNECTOR:
    case WorkflowTriggerType.CONNECTOR: {
      const overridingInput =
        overrideDefaultSettings && 'input' in overrideDefaultSettings
          ? overrideDefaultSettings.input
          : undefined;
      const input =
        overridingInput ?? getInitalStepInput(connectorSelectorItem);
      return isConnectorStepInputValid({
        props: connectorSelectorItem.actionOrTrigger.props,
        auth: connectorSelectorItem.connectorMetadata.auth,
        input,
        requireAuth: connectorSelectorItem.actionOrTrigger.requireAuth,
      });
    }
    case WorkflowActionType.LOOP_ON_ITEMS: {
      if (
        overrideDefaultSettings &&
        'input' in overrideDefaultSettings &&
        overrideDefaultSettings.input.items
      ) {
        return true;
      }
      return false;
    }
    case WorkflowTriggerType.EMPTY: {
      return false;
    }
    case WorkflowActionType.ROUTER: {
      if (overrideDefaultSettings) {
        return RouterActionSettingsWithValidation.safeParse(
          overrideDefaultSettings,
        ).success;
      }
      return false;
    }
    case WorkflowActionType.PARALLEL: {
      return true;
    }
    case WorkflowActionType.COMPONENT: {
      const overridingInput =
        overrideDefaultSettings && 'input' in overrideDefaultSettings
          ? overrideDefaultSettings.input
          : undefined;
      const input =
        overridingInput ?? getInitalStepInput(connectorSelectorItem);
      return connectorPropertiesUtils
        .buildSchema(connectorSelectorItem.props, undefined)
        .safeParse(input).success;
    }
  }
};

const getInitalStepInput = (connectorSelectorItem: ConnectorSelectorItem) => {
  if (connectorSelectorItem.type === WorkflowActionType.COMPONENT) {
    return formUtils.getDefaultValueForProperties({
      props: { ...connectorSelectorItem.props },
      existingInput: {},
    });
  }
  if (!isConnectorActionOrTrigger(connectorSelectorItem)) {
    return {};
  }
  return formUtils.getDefaultValueForProperties({
    props: {
      ...connectorSelectorItem.actionOrTrigger.props,
    },
    existingInput: {},
  });
};

const getDefaultStepValues = ({
  stepName,
  connectorSelectorItem,
  overrideDefaultSettings,
  customLogoUrl,
}: {
  stepName: string;
  connectorSelectorItem: ConnectorSelectorItem;
  overrideDefaultSettings?: StepSettings;
  customLogoUrl?: string;
}): WorkflowAction | WorkflowTrigger => {
  const errorHandlingOptions: CodeAction['settings']['errorHandlingOptions'] = {
    continueOnFailure: {
      value: false,
    },
    retryOnFailure: {
      value: false,
    },
  };

  const input = getInitalStepInput(connectorSelectorItem);
  const isValid = isStepInitiallyValid(
    connectorSelectorItem,
    overrideDefaultSettings,
  );
  const common = {
    name: stepName,
    valid: isValid,
    displayName: isConnectorActionOrTrigger(connectorSelectorItem)
      ? connectorSelectorItem.actionOrTrigger.displayName
      : connectorSelectorItem.displayName,
    skip: false,
    settings: {
      customLogoUrl,
      sampleData: DEFAULT_SAMPLE_DATA_SETTINGS,
    },
  };

  switch (connectorSelectorItem.type) {
    case WorkflowActionType.CODE:
      return deepMergeAndCast<CodeAction>(
        {
          type: WorkflowActionType.CODE,
          settings: overrideDefaultSettings ?? {
            sourceCode: {
              code: defaultCode,
              packageJson: '{}',
            },
            input,
            errorHandlingOptions,
          },
        },
        common,
      );
    case WorkflowActionType.LOOP_ON_ITEMS:
      return deepMergeAndCast<WorkflowAction>(
        {
          type: WorkflowActionType.LOOP_ON_ITEMS,
          settings: overrideDefaultSettings ?? {
            items: '',
          },
        },
        common,
      );
    case WorkflowActionType.PARALLEL:
      return deepMergeAndCast<WorkflowAction>(
        {
          type: WorkflowActionType.PARALLEL,
          settings: overrideDefaultSettings ?? {
            branches: [{ branchName: 'Branch 1' }, { branchName: 'Branch 2' }],
          },
          children: [null, null],
        },
        common,
      );
    case WorkflowActionType.ROUTER:
      return deepMergeAndCast<WorkflowAction>(
        {
          type: WorkflowActionType.ROUTER,
          settings: overrideDefaultSettings ?? {
            executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
            branches: [
              {
                conditions: [
                  [
                    {
                      operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                      firstValue: '',
                      secondValue: '',
                      caseSensitive: false,
                    },
                  ],
                ],
                branchType: BranchExecutionType.CONDITION,
                branchName: 'Branch 1',
              },
              {
                branchType: BranchExecutionType.FALLBACK,
                branchName: 'Otherwise',
              },
            ],
          },
          children: [null, null],
        },
        common,
      );
    case WorkflowActionType.COMPONENT:
      return deepMergeAndCast<ComponentAction>(
        {
          type: WorkflowActionType.COMPONENT,
          settings: overrideDefaultSettings ?? {
            componentType: connectorSelectorItem.componentType,
            input,
            errorHandlingOptions,
            propertySettings: Object.fromEntries(
              Object.entries(input).map(([key]) => [
                key,
                {
                  type: PropertyExecutionType.MANUAL,
                  schema: undefined,
                },
              ]),
            ),
          },
        },
        common,
      );
    case WorkflowActionType.CONNECTOR: {
      if (!isConnectorActionOrTrigger(connectorSelectorItem)) {
        throw new Error(
          `Invalid connector selector item ${JSON.stringify(
            connectorSelectorItem,
          )}`,
        );
      }
      return deepMergeAndCast<ConnectorAction>(
        {
          type: WorkflowActionType.CONNECTOR,
          settings: overrideDefaultSettings ?? {
            connectorName:
              connectorSelectorItem.connectorMetadata.connectorName,
            actionName: connectorSelectorItem.actionOrTrigger.name,
            connectorVersion:
              connectorSelectorItem.connectorMetadata.connectorVersion,
            input,
            errorHandlingOptions,
            propertySettings: Object.fromEntries(
              Object.entries(input).map(([key]) => [
                key,
                {
                  type: PropertyExecutionType.MANUAL,
                  schema: undefined,
                },
              ]),
            ),
          },
        },
        common,
      );
    }
    case WorkflowTriggerType.CONNECTOR: {
      if (!isConnectorActionOrTrigger(connectorSelectorItem)) {
        throw new Error(
          `Invalid connector selector item ${JSON.stringify(
            connectorSelectorItem,
          )}`,
        );
      }
      return deepMergeAndCast<ConnectorTrigger>(
        {
          type: WorkflowTriggerType.CONNECTOR,
          settings: overrideDefaultSettings ?? {
            connectorName:
              connectorSelectorItem.connectorMetadata.connectorName,
            triggerName: connectorSelectorItem.actionOrTrigger.name,
            connectorVersion:
              connectorSelectorItem.connectorMetadata.connectorVersion,
            input,
            propertySettings: Object.fromEntries(
              Object.entries(input).map(([key]) => [
                key,
                {
                  type: PropertyExecutionType.MANUAL,
                },
              ]),
            ),
          },
        },
        common,
      );
    }
    default:
      throw new Error('Unsupported type: ' + connectorSelectorItem.type);
  }
};

// Adjusts connector list height to prevent overflow on short screens
const useAdjustConnectorListHeightToAvailableSpace = () => {
  const listHeightRef = useRef<number>(MAX_CONNECTOR_SELECTOR_LIST_HEIGHT);
  const popoverTriggerRef = useRef<HTMLButtonElement | null>(null);

  if (!popoverTriggerRef.current) {
    return {
      listHeightRef,
      popoverTriggerRef,
      searchInputDivHeight: SEARCH_INPUT_DIV_HEIGHT,
    };
  }

  const popOverTriggerRect = popoverTriggerRef.current.getBoundingClientRect();
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const shouldRenderBelowPopoverTrigger =
    popOverTriggerRect.top < viewportHeight - popOverTriggerRect.bottom;

  if (shouldRenderBelowPopoverTrigger) {
    const availableSpaceBelow =
      viewportHeight - popOverTriggerRect.bottom - SEARCH_INPUT_DIV_HEIGHT;
    listHeightRef.current = Math.max(
      MIN_CONNECTOR_SELECTOR_LIST_HEIGHT,
      availableSpaceBelow,
    );
  } else {
    const availableSpaceAbove =
      popOverTriggerRect.top - SEARCH_INPUT_DIV_HEIGHT;
    listHeightRef.current = Math.max(
      MIN_CONNECTOR_SELECTOR_LIST_HEIGHT,
      availableSpaceAbove,
    );
  }

  return {
    listHeightRef,
    popoverTriggerRef,
  };
};
const MAX_CONNECTOR_SELECTOR_LIST_HEIGHT = 300 as const;
const MIN_CONNECTOR_SELECTOR_LIST_HEIGHT = 100 as const;
const SEARCH_INPUT_DIV_HEIGHT = 113 as const;
const CONNECTOR_ITEM_HEIGHT = 48 as const;
const ACTION_OR_TRIGGER_ITEM_HEIGHT = 54 as const;
const CATEGORY_ITEM_HEIGHT = 28 as const;
export const CONNECTOR_SELECTOR_ELEMENTS_HEIGHTS = {
  MAX_CONNECTOR_SELECTOR_LIST_HEIGHT,
  MIN_CONNECTOR_SELECTOR_LIST_HEIGHT,
  SEARCH_INPUT_DIV_HEIGHT,
  CONNECTOR_ITEM_HEIGHT,
  ACTION_OR_TRIGGER_ITEM_HEIGHT,
  CATEGORY_ITEM_HEIGHT,
};

const isMcpToolTrigger = (connectorName: string, triggerName: string) => {
  return (
    connectorName === '@fema-ipaas/connector-mcp' && triggerName === 'mcp_tool'
  );
};

const isChatTrigger = (connectorName: string, triggerName: string) => {
  return (
    connectorName === '@fema-ipaas/connector-forms' &&
    triggerName === 'chat_submission'
  );
};

const getStepNameFromOperationType = (
  operation: ConnectorSelectorOperation,
  workflowVersion: WorkflowVersion,
) => {
  switch (operation.type) {
    case WorkflowOperationType.UPDATE_ACTION:
      return operation.stepName;
    case WorkflowOperationType.ADD_ACTION:
      return workflowStructureUtil.findUnusedName(workflowVersion.trigger);
    case WorkflowOperationType.UPDATE_TRIGGER:
      return 'trigger';
  }
};
export const connectorSelectorUtils = {
  getDefaultStepValues,
  useAdjustConnectorListHeightToAvailableSpace,
  isConnectorStepInputValid,
  isMcpToolTrigger,
  isChatTrigger,
  removeHiddenActions,
  getStepNameFromOperationType,
  isManualTrigger: isManualConnectorTrigger,
  CONNECTOR_SELECTOR_CLIPPING_THRESHOLD: 20 as const,
};
