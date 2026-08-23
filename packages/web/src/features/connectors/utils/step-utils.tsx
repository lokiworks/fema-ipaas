import {
  ErrorHandlingOptionsParam,
  ConnectorMetadataModel,
  ConnectorMetadataModelSummary,
} from '@fema/connector-sdk';
import { LocalesEnum, spreadIfDefined } from '@fema/core-utils';
import {
  FlowAction,
  FlowActionType,
  flowStructureUtil,
  Step,
  FlowTriggerType,
  FlowTrigger,
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
  Exclude<FlowActionType, FlowActionType.CONNECTOR> | FlowTriggerType.EMPTY,
  PrimitiveStepMetadata
> = {
  [FlowActionType.CODE]: {
    displayName: t('Code'),
    logoUrl: 'https://cdn.fema.local/connectors/new-core/code.svg',
    description: t('Powerful Node.js & TypeScript code with npm'),
    type: FlowActionType.CODE as const,
  },
  [FlowActionType.LOOP_ON_ITEMS]: {
    displayName: t('Loop on Items'),
    logoUrl: 'https://cdn.fema.local/connectors/new-core/loop.svg',
    description: 'Iterate over a list of items',
    type: FlowActionType.LOOP_ON_ITEMS as const,
  },
  [FlowActionType.ROUTER]: {
    displayName: t('Router'),
    logoUrl: 'https://cdn.fema.local/connectors/new-core/router.svg',
    description: t('Split your flow into branches depending on condition(s)'),
    type: FlowActionType.ROUTER as const,
  },
  [FlowTriggerType.EMPTY]: {
    displayName: t('Empty Trigger'),
    logoUrl: 'https://cdn.fema.local/connectors/new-core/empty-trigger.svg',
    description: t('Empty Trigger'),
    type: FlowTriggerType.EMPTY as const,
  },
} as const;
export const CORE_ACTIONS_METADATA = [
  CORE_STEP_METADATA[FlowActionType.CODE],
  CORE_STEP_METADATA[FlowActionType.LOOP_ON_ITEMS],
  CORE_STEP_METADATA[FlowActionType.ROUTER],
] as const;

export const stepUtils = {
  getKeys(
    step: FlowAction | FlowTrigger,
    locale: LocalesEnum,
  ): (string | undefined)[] {
    const isConnectorStep =
      step.type === FlowActionType.CONNECTOR ||
      step.type === FlowTriggerType.CONNECTOR;
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
    step: FlowAction | FlowTrigger,
    locale: LocalesEnum,
  ): Promise<StepMetadataWithActionOrTriggerOrAgentDisplayName> {
    const customLogoUrl =
      'customLogoUrl' in step ? step.customLogoUrl : undefined;
    switch (step.type) {
      case FlowActionType.ROUTER:
      case FlowActionType.LOOP_ON_ITEMS:
      case FlowActionType.CODE:
      case FlowTriggerType.EMPTY:
        return {
          ...CORE_STEP_METADATA[step.type],
          ...spreadIfDefined('logoUrl', customLogoUrl),
          actionOrTriggerOrAgentDisplayName: '',
          actionOrTriggerOrAgentDescription: '',
        };
      case FlowActionType.CONNECTOR:
      case FlowTriggerType.CONNECTOR: {
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
          type: step.type === FlowActionType.CONNECTOR ? 'action' : 'trigger',
        });
        const actionOrTriggerDisplayName =
          step.type === FlowActionType.CONNECTOR
            ? connector.actions[step.settings.actionName!].displayName
            : connector.triggers[step.settings.triggerName!].displayName;
        const actionOrTriggerDescription =
          step.type === FlowActionType.CONNECTOR
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
          ? FlowActionType.CONNECTOR
          : FlowTriggerType.CONNECTOR,
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
  steps: ReturnType<typeof flowStructureUtil.getAllSteps>,
  excludeCore: boolean,
): { connectorNames: string[]; coreMetadata: StepMetadata[] } {
  const connectorNamesSet = new Set<string>();
  const coreMetadata: StepMetadata[] = [];

  for (const step of steps) {
    if (
      step.type === FlowActionType.CONNECTOR ||
      step.type === FlowTriggerType.CONNECTOR
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
  if (flowStructureUtil.isTrigger(step.type)) {
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
    step.type === FlowActionType.CONNECTOR
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
