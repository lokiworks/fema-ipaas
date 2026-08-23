import {
  ErrorHandlingOptionsParam,
  ConnectorMetadataModel,
  ConnectorMetadataModelSummary,
} from '@fema/connector-sdk';
import { LocalesEnum, spreadIfDefined } from '@fema/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  workflowStructureUtil,
  Step,
  WorkflowTriggerType,
  WorkflowTrigger,
  StepOutput,
  StepRunResponse,
} from '@fema/shared';
import { t } from 'i18next';

import { connectorsApi } from '../api/connectors-api';
import {
  ConnectorStepMetadata,
  PrimitiveStepMetadata,
  StepMetadata,
  StepMetadataWithActionOrTriggerOrAgentDisplayName,
} from '../types';

export const CORE_STEP_METADATA: Record<
  | Exclude<WorkflowActionType, WorkflowActionType.CONNECTOR>
  | WorkflowTriggerType.EMPTY,
  PrimitiveStepMetadata
> = {
  [WorkflowActionType.CODE]: {
    displayName: t('Code'),
    logoUrl: 'https://cdn.fema.local/connectors/new-core/code.svg',
    description: t('Powerful Node.js & TypeScript code with npm'),
    type: WorkflowActionType.CODE as const,
  },
  [WorkflowActionType.LOOP_ON_ITEMS]: {
    displayName: t('Loop on Items'),
    logoUrl: 'https://cdn.fema.local/connectors/new-core/loop.svg',
    description: 'Iterate over a list of items',
    type: WorkflowActionType.LOOP_ON_ITEMS as const,
  },
  [WorkflowActionType.ROUTER]: {
    displayName: t('Router'),
    logoUrl: 'https://cdn.fema.local/connectors/new-core/router.svg',
    description: t(
      'Split your workflow into branches depending on condition(s)',
    ),
    type: WorkflowActionType.ROUTER as const,
  },
  [WorkflowTriggerType.EMPTY]: {
    displayName: t('Empty Trigger'),
    logoUrl: 'https://cdn.fema.local/connectors/new-core/empty-trigger.svg',
    description: t('Empty Trigger'),
    type: WorkflowTriggerType.EMPTY as const,
  },
} as const;
export const CORE_ACTIONS_METADATA = [
  CORE_STEP_METADATA[WorkflowActionType.CODE],
  CORE_STEP_METADATA[WorkflowActionType.LOOP_ON_ITEMS],
  CORE_STEP_METADATA[WorkflowActionType.ROUTER],
] as const;

export const stepUtils = {
  getKeys(
    step: WorkflowAction | WorkflowTrigger,
    locale: LocalesEnum,
  ): (string | undefined)[] {
    const isConnectorStep =
      step.type === WorkflowActionType.CONNECTOR ||
      step.type === WorkflowTriggerType.CONNECTOR;
    const connectorName = isConnectorStep
      ? step.settings.connectorName
      : undefined;
    const connectorVersion = isConnectorStep
      ? step.settings.connectorVersion
      : undefined;
    const customLogoUrl = isConnectorStep
      ? 'customLogoUrl' in step
        ? (step.customLogoUrl as string)
        : undefined
      : undefined;

    return [connectorName, connectorVersion, customLogoUrl, locale, step.type];
  },
  async getMetadata(
    step: WorkflowAction | WorkflowTrigger,
    locale: LocalesEnum,
  ): Promise<StepMetadataWithActionOrTriggerOrAgentDisplayName> {
    const customLogoUrl =
      'customLogoUrl' in step ? step.customLogoUrl : undefined;
    switch (step.type) {
      case WorkflowActionType.ROUTER:
      case WorkflowActionType.LOOP_ON_ITEMS:
      case WorkflowActionType.CODE:
      case WorkflowTriggerType.EMPTY:
        return {
          ...CORE_STEP_METADATA[step.type],
          ...spreadIfDefined('logoUrl', customLogoUrl),
          actionOrTriggerOrAgentDisplayName: '',
          actionOrTriggerOrAgentDescription: '',
        };
      case WorkflowActionType.CONNECTOR:
      case WorkflowTriggerType.CONNECTOR: {
        const connector = await connectorsApi.get({
          name: step.settings.connectorName,
          version: step.settings.connectorVersion,
          locale,
        });
        const latestConnectorVersion = await connectorsApi.get({
          name: step.settings.connectorName,
          version: undefined,
          locale,
        });
        connector.logoUrl = latestConnectorVersion.logoUrl;
        const metadata = stepUtils.mapConnectorToMetadata({
          connector,
          type:
            step.type === WorkflowActionType.CONNECTOR ? 'action' : 'trigger',
        });
        const actionOrTriggerDisplayName =
          step.type === WorkflowActionType.CONNECTOR
            ? connector.actions[step.settings.actionName!].displayName
            : connector.triggers[step.settings.triggerName!].displayName;
        const actionOrTriggerDescription =
          step.type === WorkflowActionType.CONNECTOR
            ? connector.actions[step.settings.actionName!].description
            : connector.triggers[step.settings.triggerName!].description;
        return {
          ...metadata,
          errorHandlingOptions: mapErrorHandlingOptions(connector, step),
          actionOrTriggerOrAgentDescription: actionOrTriggerDescription,
          actionOrTriggerOrAgentDisplayName: actionOrTriggerDisplayName,
        };
      }
    }
  },
  mapConnectorToMetadata({
    connector,
    type,
  }: {
    connector: ConnectorMetadataModelSummary | ConnectorMetadataModel;
    type: 'action' | 'trigger';
  }): Omit<ConnectorStepMetadata, 'stepDisplayName'> {
    return {
      displayName: connector.displayName,
      logoUrl: connector.logoUrl,
      description: connector.description,
      type:
        type === 'action'
          ? WorkflowActionType.CONNECTOR
          : WorkflowTriggerType.CONNECTOR,
      connectorType: connector.connectorType,
      connectorName: connector.name,
      connectorVersion: connector.version,
      categories: connector.categories ?? [],
      packageType: connector.packageType,
      auth: connector.auth,
    };
  },
  getAgentRunId(output: StepOutput | StepRunResponse | undefined | null) {
    if (!output) {
      return undefined;
    }
    return 'output' in output &&
      'agentRunId' in (output.output as { agentRunId: string })
      ? (output.output as { agentRunId: string }).agentRunId
      : undefined;
  },
};

export function extractConnectorNamesAndCoreMetadata(
  steps: ReturnType<typeof workflowStructureUtil.getAllSteps>,
  excludeCore: boolean,
): { connectorNames: string[]; coreMetadata: StepMetadata[] } {
  const connectorNamesSet = new Set<string>();
  const coreMetadata: StepMetadata[] = [];

  for (const step of steps) {
    if (
      step.type === WorkflowActionType.CONNECTOR ||
      step.type === WorkflowTriggerType.CONNECTOR
    ) {
      connectorNamesSet.add(step.settings.connectorName);
    } else if (!excludeCore) {
      const coreMeta =
        CORE_STEP_METADATA[step.type as keyof typeof CORE_STEP_METADATA];
      if (coreMeta) {
        coreMetadata.push(coreMeta);
      }
    }
  }

  return { connectorNames: Array.from(connectorNamesSet), coreMetadata };
}

function mapErrorHandlingOptions(
  connector: ConnectorMetadataModel,
  step: Step,
): ErrorHandlingOptionsParam {
  if (workflowStructureUtil.isTrigger(step.type)) {
    return {
      continueOnFailure: {
        hide: true,
      },
      retryOnFailure: {
        hide: true,
      },
    };
  }
  const selectedAction =
    step.type === WorkflowActionType.CONNECTOR
      ? connector.actions[step.settings.actionName!]
      : null;
  const errorHandlingOptions = selectedAction?.errorHandlingOptions;
  if (errorHandlingOptions) {
    return errorHandlingOptions;
  }
  return {
    continueOnFailure: {
      hide: false,
      defaultValue: false,
    },
    retryOnFailure: {
      hide: false,
      defaultValue: false,
    },
  };
}
