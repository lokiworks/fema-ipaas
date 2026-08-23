import { LocalesEnum, isNil } from '@fema/core-utils';
import {
  FlowAction,
  FlowActionType,
  FlowTriggerType,
  SuggestionType,
  FlowTrigger,
} from '@fema/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { authenticationSession } from '@/lib/authentication-session';

import { connectorsApi } from '../api/connectors-api';
import {
  StepMetadataWithActionOrTriggerOrAgentDisplayName,
  StepMetadataWithSuggestions,
} from '../types';
import {
  CORE_ACTIONS_METADATA,
  CORE_STEP_METADATA,
  stepUtils,
} from '../utils/step-utils';

export const stepsHooks = {
  useStepMetadata: ({ step }: UseStepMetadata) => {
    const { i18n } = useTranslation();
    const query = useQuery<
      StepMetadataWithActionOrTriggerOrAgentDisplayName,
      Error
    >({
      queryKey: getQueryKeyForStepMetadata(step, i18n.language as LocalesEnum),
      queryFn: () => stepUtils.getMetadata(step!, i18n.language as LocalesEnum),
      enabled: !isNil(step),
    });
    return {
      stepMetadata: query.data,
      isLoading: query.isLoading,
    };
  },
  useStepsMetadata: (props: (FlowAction | FlowTrigger)[]) => {
    const { i18n } = useTranslation();
    return useQueries({
      queries: props.map((step) => {
        return {
          queryKey: getQueryKeyForStepMetadata(
            step,
            i18n.language as LocalesEnum,
          ),
          queryFn: () =>
            stepUtils.getMetadata(step, i18n.language as LocalesEnum),
          staleTime: Infinity,
        };
      }),
    });
  },
  useAllStepsMetadata: ({ searchQuery, type, enabled }: UseMetadataProps) => {
    const { i18n } = useTranslation();
    const projectId = authenticationSession.getProjectId()!;
    const query = useQuery<StepMetadataWithSuggestions[], Error>({
      queryKey: [
        'connectors-metadata',
        searchQuery,
        type,
        projectId,
        i18n.language,
      ],
      queryFn: async () => {
        const connectors = await connectorsApi.list({
          projectId,
          searchQuery,
          suggestionType:
            type === 'action' ? SuggestionType.ACTION : SuggestionType.TRIGGER,
          locale: i18n.language as LocalesEnum,
        });

        const filteredConnectorsBySuggestionType = connectors.filter(
          (connector) =>
            (type === 'action' && connector.actions > 0) ||
            (type === 'trigger' && connector.triggers > 0),
        );

        const connectorsMetadata = filteredConnectorsBySuggestionType.map(
          (connector) => {
            const metadata = stepUtils.mapConnectorToMetadata({
              connector,
              type,
            });
            return {
              ...metadata,
              suggestedActions: connector.suggestedActions,
              suggestedTriggers: connector.suggestedTriggers,
            };
          },
        );

        switch (type) {
          case 'action': {
            const filteredCoreActions = CORE_ACTIONS_METADATA.filter((step) =>
              passSearch(searchQuery, step),
            );
            return [...filteredCoreActions, ...connectorsMetadata];
          }
          case 'trigger':
            return [...connectorsMetadata];
        }
      },
      enabled,
      staleTime: searchQuery ? 0 : Infinity,
    });
    return {
      refetch: query.refetch,
      metadata: query.data,
      isLoading: query.isLoading,
    };
  },
};
function passSearch(
  searchQuery: string | undefined,
  data: (typeof CORE_STEP_METADATA)[keyof typeof CORE_STEP_METADATA],
) {
  if (!searchQuery) {
    return true;
  }
  return JSON.stringify({ data })
    .toLowerCase()
    .includes(searchQuery?.toLowerCase());
}

type UseStepMetadata = {
  step: FlowAction | FlowTrigger | undefined;
};

type UseMetadataProps = {
  searchQuery: string;
  enabled?: boolean;
  type: 'action' | 'trigger';
};

const getQueryKeyForStepMetadata = (
  step: FlowAction | FlowTrigger | undefined,
  locale: LocalesEnum,
): (string | undefined)[] => {
  if (isNil(step)) {
    return ['step-metadata-disabled', locale];
  }
  const isConnectorStep =
    step.type === FlowActionType.CONNECTOR ||
    step.type === FlowTriggerType.CONNECTOR;
  const connectorName = isConnectorStep
    ? step.settings.connectorName
    : undefined;
  const connectorVersion = isConnectorStep
    ? step.settings.connectorVersion
    : undefined;
  const customLogoUrl =
    'customLogoUrl' in step && typeof step.customLogoUrl === 'string'
      ? step.customLogoUrl
      : undefined;
  const actionName =
    step.type === FlowActionType.CONNECTOR
      ? step.settings.actionName
      : undefined;
  const triggerName =
    step.type === FlowTriggerType.CONNECTOR
      ? step.settings.triggerName
      : undefined;
  return [
    actionName,
    triggerName,
    connectorName,
    connectorVersion,
    customLogoUrl,
    locale,
    step.type,
  ];
};
