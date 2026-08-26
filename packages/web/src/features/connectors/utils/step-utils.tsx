import { FlowComponentCategory } from '@fema-ipaas/component-sdk';
import {
  ErrorHandlingOptionsParam,
  ConnectorMetadataModel,
  ConnectorMetadataModelSummary,
} from '@fema-ipaas/connector-sdk';
import { LocalesEnum, spreadIfDefined } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  workflowStructureUtil,
  Step,
  WorkflowTriggerType,
  WorkflowTrigger,
  StepOutput,
  StepRunResponse,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { componentLogoUrl, componentsApi } from '@/features/components';

import { connectorsApi } from '../api/connectors-api';
import {
  ConnectorStepMetadata,
  PrimitiveStepMetadata,
  StepMetadata,
  StepMetadataWithActionOrTriggerOrAgentDisplayName,
} from '../types';

const buildCoreStepMetadata = (): Record<
  | Exclude<
      WorkflowActionType,
      WorkflowActionType.CONNECTOR | WorkflowActionType.COMPONENT
    >
  | WorkflowTriggerType.EMPTY,
  PrimitiveStepMetadata
> => ({
  [WorkflowActionType.CODE]: {
    displayName: t('Code'),
    logoUrl: '/assets/steps/code.svg',
    description: t('Powerful Node.js & TypeScript code with npm'),
    type: WorkflowActionType.CODE as const,
  },
  [WorkflowActionType.LOOP_ON_ITEMS]: {
    displayName: t('Loop on Items'),
    logoUrl: '/assets/steps/loop.svg',
    description: t('Iterate over a list of items'),
    type: WorkflowActionType.LOOP_ON_ITEMS as const,
  },
  [WorkflowActionType.ROUTER]: {
    displayName: t('Router'),
    logoUrl: '/assets/steps/router.svg',
    description: t(
      'Split your workflow into branches depending on condition(s)',
    ),
    type: WorkflowActionType.ROUTER as const,
  },
  [WorkflowActionType.PARALLEL]: {
    displayName: t('Parallel'),
    logoUrl: '/assets/steps/parallel.svg',
    description: t(
      'Run several branches at the same time and wait for all of them',
    ),
    type: WorkflowActionType.PARALLEL as const,
  },
  [WorkflowTriggerType.EMPTY]: {
    displayName: t('Empty Trigger'),
    logoUrl: '/assets/steps/empty-trigger.svg',
    description: t('Empty Trigger'),
    type: WorkflowTriggerType.EMPTY as const,
  },
});

export const getCoreStepMetadata = () => buildCoreStepMetadata();

export const getCoreActionsMetadata = () => {
  const metadata = buildCoreStepMetadata();
  return [
    metadata[WorkflowActionType.CODE],
    metadata[WorkflowActionType.LOOP_ON_ITEMS],
    metadata[WorkflowActionType.ROUTER],
    metadata[WorkflowActionType.PARALLEL],
  ];
};

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
      case WorkflowActionType.PARALLEL:
      case WorkflowActionType.LOOP_ON_ITEMS:
      case WorkflowActionType.CODE:
      case WorkflowTriggerType.EMPTY:
        return {
          ...getCoreStepMetadata()[step.type],
          ...spreadIfDefined('logoUrl', customLogoUrl),
          actionOrTriggerOrAgentDisplayName: '',
          actionOrTriggerOrAgentDescription: '',
        };
      case WorkflowActionType.COMPONENT: {
        const components = await componentsApi.list();
        const component = components.find(
          (candidate) => candidate.type === step.settings.componentType,
        );
        return {
          type: WorkflowActionType.COMPONENT,
          componentType: step.settings.componentType,
          category: component?.category ?? FlowComponentCategory.RUNTIME,
          icon: component?.icon ?? '',
          props: component?.props ?? {},
          displayName: component?.displayName ?? step.settings.componentType,
          description: component?.description ?? '',
          logoUrl: componentLogoUrl(component?.icon ?? ''),
          actionOrTriggerOrAgentDisplayName: component?.displayName ?? '',
          actionOrTriggerOrAgentDescription: component?.description ?? '',
        };
      }
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
        getCoreStepMetadata()[
          step.type as keyof ReturnType<typeof getCoreStepMetadata>
        ];
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
