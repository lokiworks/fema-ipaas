import {
  ActionClassification,
  ConnectorMetadataModel,
  PropertyType,
} from '@fema-ipaas/connector-sdk';
import { LocalesEnum, isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
  workflowConnectorUtil,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { connectionsQueries } from '@/features/connections';
import { connectorsApi } from '@/features/connectors';
import {
  agentToolsUtils,
  mcpServerAccessUtils,
  mcpServersHooks,
} from '@/features/mcp-servers';
import { mappingTablesHooks } from '@/features/mapping-tables';
import { variablesQueries } from '@/features/variables/hooks/variables-hooks';
import {
  ConnectionSpec,
  ConnectorSpec,
  ConnectorSpecStatus,
  DebugRunEvidence,
  OperationSpec,
  ValidationResult,
  WriteStep,
  workflowValidator,
} from '@/features/workflows/utils/workflow-validator';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

export function useValidationFor(
  trigger: WorkflowTrigger,
  debugVerification: DebugRunEvidence | null = null,
): WorkflowValidationState {
  const { i18n } = useTranslation();
  const projectId = authenticationSession.getProjectId() ?? '';
  const connectorRefs = useMemo(() => connectorRefsOf(trigger), [trigger]);
  const connectorQueries = useQueries({
    queries: connectorRefs.map((ref) => ({
      queryKey: ['connector', ref.name, ref.version, i18n.language, undefined],
      queryFn: () =>
        connectorsApi.get({
          name: ref.name,
          version: ref.version,
          locale: localeOf(i18n.language),
        }),
      staleTime: Infinity,
      retry: (failureCount: number, error: Error) =>
        !isNotFound(error) && failureCount < 3,
    })),
  });
  const connectionsQuery = connectionsQueries.useConnections({
    request: { projectId, limit: 1000 },
    extraKeys: ['builder-validation', projectId],
    enabled: projectId.length > 0,
    staleTime: 30_000,
  });
  const hasAgentStep = useMemo(() => hasAgentStepIn(trigger), [trigger]);
  const mcpServersQuery = mcpServersHooks.useMcpServers({
    enabled: hasAgentStep,
  });
  const mappingTablesQuery = mappingTablesHooks.useMappingTables(
    projectId.length > 0 ? projectId : null,
  );
  const variablesQuery = variablesQueries.useVariables({
    request: { projectId, limit: 100 },
    extraKeys: ['mention-resolver-variables', projectId],
    enabled: projectId.length > 0,
  });

  const connectorSignature = connectorQueries
    .map((query) => `${query.status}:${query.dataUpdatedAt}`)
    .join('|');

  const connectors = useMemo(
    () =>
      Object.fromEntries(
        connectorRefs.flatMap((ref, index) => {
          const query = connectorQueries[index];
          if (query?.isError && isNotFound(query.error)) {
            const missing: ConnectorSpec = {
              status: ConnectorSpecStatus.MISSING,
            };
            return [[ref.name, missing]];
          }
          return isNil(query?.data) ? [] : [[ref.name, specOf(query.data)]];
        }),
      ),
    [connectorRefs, connectorSignature],
  );

  const connections = useMemo(() => {
    const page = connectionsQuery.data;
    if (isNil(page)) {
      return null;
    }
    return Object.fromEntries(
      page.data.map((connection) => {
        const spec: ConnectionSpec = {
          displayName: connection.displayName,
          status: connection.status,
        };
        return [connection.externalId, spec];
      }),
    );
  }, [connectionsQuery.data]);

  const mcpServers = useMemo(() => {
    if (!hasAgentStep || isNil(mcpServersQuery.data)) {
      return null;
    }
    return mcpServersQuery.data
      .filter((server) =>
        mcpServerAccessUtils.isAvailableInProject({ server, projectId }),
      )
      .map(agentToolsUtils.infoOf);
  }, [hasAgentStep, mcpServersQuery.data, projectId]);

  const mappingTableIds = useMemo(
    () => mappingTablesQuery.data?.map((table) => table.id) ?? null,
    [mappingTablesQuery.data],
  );
  const variableNames = useMemo(
    () => variablesQuery.data?.data.map((variable) => variable.name) ?? null,
    [variablesQuery.data],
  );

  const result = useMemo(
    () =>
      workflowValidator.validate({
        trigger,
        connectors,
        connections,
        mcpServers,
        mappingTableIds,
        variableNames,
        debugVerification,
      }),
    [
      trigger,
      connectors,
      connections,
      mcpServers,
      mappingTableIds,
      variableNames,
      debugVerification,
    ],
  );

  const writeSteps = useMemo(
    () => workflowValidator.writeSteps({ trigger, connectors }),
    [trigger, connectors],
  );

  const isLoading =
    connectorQueries.some((query) => query.isLoading) ||
    connectionsQuery.isLoading;

  return { ...result, writeSteps, isLoading };
}

function hasAgentStepIn(trigger: WorkflowTrigger): boolean {
  return workflowStructureUtil
    .getAllSteps(trigger)
    .some(
      (step) =>
        step.type === WorkflowActionType.CONNECTOR &&
        step.settings.connectorName === AGENT_TARGET.connectorName &&
        step.settings.actionName === AGENT_TARGET.actionName,
    );
}

function connectorRefsOf(trigger: WorkflowTrigger): ConnectorRef[] {
  const refs = workflowStructureUtil.getAllSteps(trigger).flatMap((step) =>
    step.type === WorkflowActionType.CONNECTOR ||
    step.type === WorkflowTriggerType.CONNECTOR
      ? [
          {
            name: step.settings.connectorName,
            version: workflowConnectorUtil.getExactVersion(
              step.settings.connectorVersion,
            ),
          },
        ]
      : [],
  );
  return [
    ...new Map(refs.map((ref) => [`${ref.name}@${ref.version}`, ref])).values(),
  ];
}

function specOf(model: ConnectorMetadataModel): ConnectorSpec {
  const toOperations = (
    operations: Record<
      string,
      {
        requireAuth?: boolean;
        classification?: ActionClassification;
        props: Record<
          string,
          { displayName: string; required: boolean; type: PropertyType }
        >;
      }
    >,
  ): Record<string, OperationSpec> =>
    Object.fromEntries(
      Object.entries(operations).map(([name, operation]) => [
        name,
        {
          requiresAuth: operation.requireAuth !== false,
          classification: operation.classification,
          props: Object.entries(operation.props)
            .filter(([, prop]) => !IGNORED_PROP_TYPES.includes(prop.type))
            .map(([propName, prop]) => ({
              name: propName,
              displayName: prop.displayName,
              required: prop.required,
            })),
        },
      ]),
    );
  return {
    status: ConnectorSpecStatus.LOADED,
    requiresAuth: !isNil(model.auth),
    actions: toOperations(model.actions),
    triggers: toOperations(model.triggers),
  };
}

function localeOf(language: string): LocalesEnum | undefined {
  return Object.values(LocalesEnum).find((locale) => locale === language);
}

function isNotFound(error: unknown): boolean {
  return api.isError(error) && error.response?.status === 404;
}

const IGNORED_PROP_TYPES: PropertyType[] = [
  PropertyType.MARKDOWN,
  PropertyType.DYNAMIC,
  PropertyType.CHECKBOX,
];

export type WorkflowValidationState = ValidationResult & {
  writeSteps: WriteStep[];
  isLoading: boolean;
};

type ConnectorRef = {
  name: string;
  version: string;
};

const AGENT_TARGET = {
  connectorName: '@fema-ipaas/connector-ai',
  actionName: 'run_agent',
};
