import {
  ConnectorMetadataModel,
  ConnectorMetadataModelSummary,
  PropertyType,
  ExecutePropsResult,
} from '@fema/connector-sdk';
import { LocalesEnum } from '@fema/core-utils';
import {
  AddConnectorRequestBody,
  FlowActionType,
  flowConnectorUtil,
  ConnectorOptionRequest,
  PlatformWithoutSensitiveData,
  FlowTriggerType,
  ApFlagId,
  ApEnvironment,
  TelemetryEventName,
} from '@fema/shared';
import {
  QueryClient,
  useMutation,
  useQueries,
  useQuery,
} from '@tanstack/react-query';
import { t } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import semver from 'semver';

import { useTelemetry } from '@/components/providers/telemetry-provider';
import { appConnectionsApi } from '@/features/connections/api/app-connections';
import {
  StepMetadataWithSuggestions,
  CategorizedStepMetadataWithSuggestions,
} from '@/features/connectors/types';
import { flagsHooks } from '@/hooks/flags-hooks';
import { platformHooks } from '@/hooks/platform-hooks';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

import { connectorsApi } from '../api/connectors-api';
import {
  ConnectorSelectorTabType,
  useConnectorSelectorTabs,
} from '../stores/connector-selector-tabs-provider';
import { connectorSearchUtils } from '../utils/connector-search-utils';
import { connectorSelectorCustomization } from '../utils/connector-selector-customization';

import { stepsHooks } from './steps-hooks';

const {
  getPinnedConnectors,
  getPopularConnectors,
  getAiAndAgentsConnectors,
  isUtilityConnector,
  isAppConnector,
  getHighlightedConnectors,
  isFlowController,
} = connectorSearchUtils;

type UseConnectorModelForStepSettings = {
  name: string;
  version: string | undefined;
  enabled?: boolean;
};

type UseConnectorProps = {
  name: string;
  version?: string;
  enabled?: boolean;
  projectId?: string;
};

type UseMultipleConnectorsProps = {
  names: string[];
};

type UseConnectorsProps = {
  searchQuery?: string;
  includeHidden?: boolean;
  isTableQuery?: boolean;
  skipProjectFilter?: boolean;
};
type UseConnectorsSearchProps = {
  searchQuery: string;
  enabled?: boolean;
  type: 'action' | 'trigger';
  shouldCaptureEvent: boolean;
};

export const connectorsHooks = {
  useConnector: ({
    name,
    version,
    enabled = true,
    projectId,
  }: UseConnectorProps) => {
    const { i18n } = useTranslation();
    const query = useQuery<ConnectorMetadataModel, Error>({
      queryKey: ['connector', name, version, i18n.language, projectId],
      queryFn: () =>
        connectorsApi.get({
          name,
          version,
          locale: i18n.language as LocalesEnum,
          projectId,
        }),
      staleTime: Infinity,
      enabled,
      retry: (failureCount, error) => {
        if (isConnectorNotFoundError(error)) {
          return false;
        }
        return failureCount < 3;
      },
    });
    return {
      connectorModel: query.data,
      isLoading: query.isLoading,
      isSuccess: query.isSuccess,
      isError: query.isError,
      isNotFound: query.isError && isConnectorNotFoundError(query.error),
      refetch: query.refetch,
    };
  },
  useConnectorModelForStepSettings: ({
    name,
    version,
    enabled = true,
  }: UseConnectorModelForStepSettings) => {
    const exactVersion = version
      ? flowConnectorUtil.getExactVersion(version)
      : undefined;
    const connectorQuery = connectorsHooks.useConnector({
      name,
      version: exactVersion,
      enabled,
    });
    return {
      connectorModel: connectorQuery.connectorModel,
      isLoading: connectorQuery.isLoading,
      isSuccess: connectorQuery.isSuccess,
      isNotFound: connectorQuery.isNotFound,
      refetch: connectorQuery.refetch,
    };
  },
  useMultipleConnectors: ({ names }: UseMultipleConnectorsProps) => {
    const { i18n } = useTranslation();
    return useQueries({
      queries: names.map((name) => ({
        queryKey: ['connector', name, undefined, i18n.language],
        queryFn: () =>
          connectorsApi.get({
            name,
            version: undefined,
            locale: i18n.language as LocalesEnum,
          }),
        staleTime: Infinity,
      })),
    });
  },
  useConnectorSummariesByNames: ({ names }: UseMultipleConnectorsProps) => {
    const { connectors, isLoading } = connectorsHooks.useConnectors({});
    const summaries = useMemo(() => {
      if (!connectors) return [];
      const byName = new Map(connectors.map((p) => [p.name, p]));
      return names
        .map((name) => byName.get(name))
        .filter((p): p is ConnectorMetadataModelSummary => !!p);
    }, [connectors, names]);
    return { summaries, isLoading };
  },
  useConnectorSummary: ({ name }: { name: string }) => {
    const { connectors, isLoading } = connectorsHooks.useConnectors({});
    const summary = useMemo(
      () => connectors?.find((p) => p.name === name),
      [connectors, name],
    );
    return { summary, isLoading };
  },
  useConnectors: ({
    searchQuery,
    includeHidden = false,
    isTableQuery = false,
    skipProjectFilter = false,
  }: UseConnectorsProps) => {
    const { i18n } = useTranslation();
    const projectId = skipProjectFilter
      ? undefined
      : authenticationSession.getProjectId()!;
    const query = useQuery<ConnectorMetadataModelSummary[], Error>({
      queryKey: [
        isTableQuery ? 'connectors-table' : 'connectors',
        searchQuery,
        includeHidden,
        skipProjectFilter,
        projectId,
        i18n.language,
      ],
      queryFn: () =>
        connectorsApi.list({
          projectId,
          searchQuery,
          includeHidden,
          locale: i18n.language as LocalesEnum,
        }),
      staleTime: searchQuery ? 0 : Infinity,
      meta: isTableQuery
        ? { showErrorDialog: true, loadSubsetOptions: {} }
        : undefined,
    });
    return {
      connectors: query.data,
      isLoading: query.isLoading,
      refetch: query.refetch,
    };
  },
  useConnectorsSearch: (
    props: UseConnectorsSearchProps,
  ): {
    isLoading: boolean;
    data: CategorizedStepMetadataWithSuggestions[];
  } => {
    const { selectedTab, selectedCustomTabId } = useConnectorSelectorTabs();
    const { capture } = useTelemetry();
    const { data: environment } = flagsHooks.useFlag<ApEnvironment>(
      ApFlagId.ENVIRONMENT,
    );
    const { metadata, isLoading: isLoadingConnectors } =
      stepsHooks.useAllStepsMetadata(props);
    const { platform } = platformHooks.useCurrentPlatform();
    if (!metadata || isLoadingConnectors) {
      return {
        isLoading: true,
        data: [],
      };
    }
    const connectorsMetadataWithoutEmptySuggestions =
      filterOutConnectorsWithNoSuggestions(metadata);

    const pinnedConnectors = getPinnedConnectors(
      connectorsMetadataWithoutEmptySuggestions,
      platform.pinnedConnectors ?? [],
    );

    const popularConnectors = getPopularConnectors(
      connectorsMetadataWithoutEmptySuggestions,
      platform.pinnedConnectors ?? [],
    );

    const flowControllerConnectors =
      connectorsMetadataWithoutEmptySuggestions.filter(isFlowController);

    const utilityConnectors =
      connectorsMetadataWithoutEmptySuggestions.filter(isUtilityConnector);

    const connectorMetadataWithoutPopularOrPinnedConnectors =
      connectorsMetadataWithoutEmptySuggestions.filter(
        (p) => !popularConnectors.includes(p) && !pinnedConnectors.includes(p),
      );

    const appConnectors =
      connectorMetadataWithoutPopularOrPinnedConnectors.filter(isAppConnector);

    const utilitiesCategory = {
      title: t('Utility'),
      metadata: utilityConnectors,
    };
    const flowControllerCategory = {
      title: t('Flow Controller'),
      metadata: flowControllerConnectors,
    };
    const appsCategory = {
      title: t('Apps'),
      metadata: appConnectors,
    };
    const popularCategory = {
      title: t('Popular'),
      metadata: popularConnectors,
    };
    const allCategory = {
      title: t('All'),
      metadata: connectorsMetadataWithoutEmptySuggestions,
    };

    switch (selectedTab) {
      case ConnectorSelectorTabType.EXPLORE:
        return {
          isLoading: false,
          data: getExploreTabContent(
            connectorsMetadataWithoutEmptySuggestions,
            platform,
            props.type,
            environment,
          ),
        };
      case ConnectorSelectorTabType.UTILITY:
        return {
          isLoading: false,
          data: [utilitiesCategory, flowControllerCategory],
        };
      case ConnectorSelectorTabType.AI_AND_AGENTS:
        return {
          isLoading: false,
          data: getAiAndAgentsConnectors(
            connectorsMetadataWithoutEmptySuggestions,
          ),
        };
      case ConnectorSelectorTabType.APPROVALS:
        return {
          isLoading: false,
          data: [],
        };
      case ConnectorSelectorTabType.CUSTOM: {
        const customTab = connectorSelectorCustomization.getCustomTab({
          config: platform.connectorSelectorConfig,
          customTabId: selectedCustomTabId,
        });
        const categories: CategorizedStepMetadataWithSuggestions[] = [];
        const flatConnectors = getPinnedConnectors(
          connectorsMetadataWithoutEmptySuggestions,
          customTab?.connectorNames ?? [],
        );
        if (flatConnectors.length > 0) {
          categories.push({
            title: customTab?.title ?? t('All'),
            metadata: flatConnectors,
          });
        }
        for (const section of customTab?.sections ?? []) {
          const sectionConnectors = getPinnedConnectors(
            connectorsMetadataWithoutEmptySuggestions,
            section.connectorNames,
          );
          if (sectionConnectors.length > 0) {
            categories.push({
              title: section.title,
              metadata: sectionConnectors,
            });
          }
        }
        return {
          isLoading: false,
          data: categories,
        };
      }
      case ConnectorSelectorTabType.APPS: {
        const popularAppsCategory = {
          ...popularCategory,
          metadata: popularCategory.metadata.filter(isAppConnector),
        };
        const result = {
          isLoading: false,
          data: [popularAppsCategory, appsCategory],
        };
        if (pinnedConnectors.length > 0) {
          result.data.unshift({
            title: t('Highlights'),
            metadata: pinnedConnectors,
          });
        }
        return result;
      }

      case ConnectorSelectorTabType.NONE: {
        if (props.shouldCaptureEvent && props.searchQuery.length > 3) {
          capture({
            name: TelemetryEventName.CONNECTOR_SELECTOR_SEARCH,
            payload: {
              search: props.searchQuery,
              isTrigger: props.type === 'trigger',
              selectedActionOrTriggerName: null,
            },
          });
        }
        return {
          isLoading: false,
          data: allCategory.metadata.length > 0 ? [allCategory] : [],
        };
      }
    }
  },
  useConnectorOptions: <
    T extends
      | PropertyType.DYNAMIC
      | PropertyType.DROPDOWN
      | PropertyType.MULTI_SELECT_DROPDOWN,
  >({
    onSuccess,
    onError,
    onMutate,
  }: {
    onSuccess: (data: ExecutePropsResult<T>) => void;
    onError: (error: Error) => void;
    onMutate: () => void;
  }) => {
    return useMutation<
      ExecutePropsResult<T>,
      Error,
      { request: ConnectorOptionRequest; propertyType: T }
    >({
      mutationFn: async ({ request, propertyType }) => {
        onMutate();
        return connectorsApi.options(request, propertyType);
      },
      onSuccess,
      onError,
      retry: 1,
      retryDelay: 1000,
    });
  },
  useConnectorVersions: (connectorName: string) => {
    const { data: release } = flagsHooks.useFlag<string>(
      ApFlagId.CURRENT_VERSION,
    );
    const query = useQuery({
      queryKey: ['connectors-registry', release],
      queryFn: () => connectorsApi.registry(release!),
      staleTime: Infinity,
      enabled: !!connectorName && !!release,
      select: (registry) =>
        registry
          .filter((entry) => entry.name === connectorName)
          .map((entry) => ({ version: entry.version }))
          .sort((a, b) => semver.rcompare(a.version, b.version)),
    });
    return {
      connectorVersions: query.data,
      isLoading: query.isLoading,
    };
  },
  useConnectorForEmbeddingConnection: ({
    connectorName,
    connectionExternalId,
  }: {
    connectorName: string;
    connectionExternalId: string;
  }) => {
    return useQuery<ConnectorMetadataModel, Error>({
      queryKey: ['connector', connectorName, connectionExternalId],
      queryFn: async () => {
        const appConnection = (
          await appConnectionsApi.list({
            connectorName,
            limit: 1,
            projectId: authenticationSession.getProjectId()!,
          })
        ).data.find(
          (connection) => connection.externalId === connectionExternalId,
        );
        if (!appConnection) {
          return connectorsApi.get({ name: connectorName });
        }
        return connectorsApi.get({
          name: appConnection.connectorName,
          version: appConnection.connectorVersion,
        });
      },
      staleTime: Infinity,
    });
  },
};

export const connectorsMutations = {
  useInstallConnector: ({
    onSuccess,
    onError,
  }: {
    onSuccess: () => void;
    onError: (error: unknown) => void;
  }) => {
    return useMutation({
      mutationFn: (data: AddConnectorRequestBody) =>
        connectorsApi.install(data),
      onSuccess,
      onError,
    });
  },
};

const isConnectorNotFoundError = (error: unknown) =>
  api.isError(error) && error.response?.status === 404;

const filterOutConnectorsWithNoSuggestions = (
  stepsMetadata: StepMetadataWithSuggestions[],
) => {
  return stepsMetadata.filter((metadata) => {
    const isActionWithSuggestions =
      metadata.type === FlowActionType.CONNECTOR &&
      metadata.suggestedActions &&
      metadata.suggestedActions.length > 0;

    const isTriggerWithSuggestions =
      metadata.type === FlowTriggerType.CONNECTOR &&
      metadata.suggestedTriggers &&
      metadata.suggestedTriggers.length > 0;

    const isNotConnectorType =
      metadata.type !== FlowActionType.CONNECTOR &&
      metadata.type !== FlowTriggerType.CONNECTOR;
    return (
      isActionWithSuggestions || isTriggerWithSuggestions || isNotConnectorType
    );
  });
};

const getExploreTabContent = (
  queryResult: StepMetadataWithSuggestions[],
  platform: PlatformWithoutSensitiveData,
  type: 'action' | 'trigger',
  environment: ApEnvironment | null,
) => {
  const popularCategory: CategorizedStepMetadataWithSuggestions = {
    title: t('Popular'),
    metadata: environment === ApEnvironment.DEVELOPMENT ? queryResult : [],
  };
  if (environment === ApEnvironment.DEVELOPMENT) {
    return [popularCategory];
  }
  const pinnedConnectors = getPinnedConnectors(
    queryResult,
    platform.pinnedConnectors ?? [],
  );
  const popularConnectors = getPopularConnectors(
    queryResult,
    platform.pinnedConnectors ?? [],
  );

  if (popularConnectors.length > 0) {
    popularCategory.metadata = [
      ...popularCategory.metadata,
      ...popularConnectors,
    ];
  }

  const hightlightedConnectorsCategory: CategorizedStepMetadataWithSuggestions =
    {
      title: t('Highlights'),
      metadata: [],
    };
  const highlightedConnectors = getHighlightedConnectors(queryResult, type);
  const codeConnector = queryResult.find(
    (connector) => connector.type === FlowActionType.CODE,
  );
  const branchConnector = queryResult.find(
    (connector) => connector.type === FlowActionType.ROUTER,
  );
  const loopConnector = queryResult.find(
    (connector) => connector.type === FlowActionType.LOOP_ON_ITEMS,
  );

  if (highlightedConnectors.length > 0) {
    hightlightedConnectorsCategory.metadata.push(...highlightedConnectors);
  }

  if (branchConnector) {
    hightlightedConnectorsCategory.metadata.splice(0, 0, branchConnector);
  }

  if (codeConnector) {
    hightlightedConnectorsCategory.metadata.splice(3, 0, codeConnector);
  }
  if (loopConnector) {
    hightlightedConnectorsCategory.metadata.splice(5, 0, loopConnector);
  }
  if (pinnedConnectors.length > 0) {
    hightlightedConnectorsCategory.metadata = [
      ...pinnedConnectors,
      ...hightlightedConnectorsCategory.metadata,
    ];
  }

  return [popularCategory, hightlightedConnectorsCategory];
};

function invalidateConnectorCaches(queryClient: QueryClient): Promise<void[]> {
  const connectorDerivedQueryKeys = [
    ['connectors'],
    ['connectors-table'],
    ['connectors-metadata'],
    ['connector'],
  ];
  return Promise.all(
    connectorDerivedQueryKeys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

export const connectorCacheUtils = { invalidateConnectorCaches };
