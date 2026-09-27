import { isNil } from '@fema-ipaas/core-utils';
import {
  MCP_CONNECTOR_NAME,
  McpServer,
  PropertyExecutionType,
  WorkflowActionType,
  WorkflowOperationType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ServerIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  ConnectorSelectorConnectorItem,
  ConnectorSelectorOperation,
  ConnectorStepMetadata,
  connectorsHooks,
  connectorSelectorUtils,
} from '@/features/connectors';
import { mcpServerAccessUtils, mcpServersHooks } from '@/features/mcp-servers';
import { authenticationSession } from '@/lib/authentication-session';

import { useBuilderStateContext } from '../builder-hooks';

export function McpServerPickerEntries({
  operation,
}: {
  operation: ConnectorSelectorOperation;
}) {
  const [handleAddingOrUpdatingStep] = useBuilderStateContext((state) => [
    state.handleAddingOrUpdatingStep,
  ]);
  const { data: servers } = mcpServersHooks.useMcpServers({});
  const { connectorModel } = connectorsHooks.useConnector({
    name: MCP_CONNECTOR_NAME,
  });
  const projectId = authenticationSession.getProjectId() ?? '';
  const available = (servers ?? []).filter((server) =>
    mcpServerAccessUtils.isAvailableInProject({ server, projectId }),
  );

  if (
    operation.type === WorkflowOperationType.UPDATE_TRIGGER ||
    isNil(connectorModel) ||
    available.length === 0
  ) {
    return null;
  }
  const callTool = connectorModel.actions['call_tool'];
  if (isNil(callTool)) {
    return null;
  }

  const connectorMetadata: ConnectorStepMetadata = {
    displayName: connectorModel.displayName,
    logoUrl: connectorModel.logoUrl,
    description: connectorModel.description,
    type: WorkflowActionType.CONNECTOR,
    connectorName: connectorModel.name,
    connectorVersion: connectorModel.version,
    categories: connectorModel.categories ?? [],
    packageType: connectorModel.packageType,
    connectorType: connectorModel.connectorType,
    auth: connectorModel.auth,
  };

  const selectServer = (server: McpServer) => {
    const item: ConnectorSelectorConnectorItem = {
      type: WorkflowActionType.CONNECTOR,
      actionOrTrigger: callTool,
      connectorMetadata,
    };
    const stepName = handleAddingOrUpdatingStep({
      connectorSelectorItem: item,
      operation,
      selectStepAfter: true,
    });
    const defaultValues = connectorSelectorUtils.getDefaultStepValues({
      stepName,
      connectorSelectorItem: item,
    });
    if (defaultValues.type !== WorkflowActionType.CONNECTOR) {
      return;
    }
    handleAddingOrUpdatingStep({
      connectorSelectorItem: item,
      operation: { type: WorkflowOperationType.UPDATE_ACTION, stepName },
      selectStepAfter: false,
      overrideSettings: {
        ...defaultValues.settings,
        input: {
          ...defaultValues.settings.input,
          auth: `{{connections['${server.externalId}']}}`,
        },
        propertySettings: {
          ...defaultValues.settings.propertySettings,
          auth: { type: PropertyExecutionType.MANUAL, schema: undefined },
        },
      },
    });
  };

  return (
    <div className="flex flex-col gap-0.5 border-t p-2">
      <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">
        {t('MCP servers')}
      </div>
      {available.map((server) => (
        <button
          key={server.id}
          type="button"
          title={server.description || server.displayName}
          onClick={() => selectServer(server)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
        >
          <ServerIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 grow truncate">{server.displayName}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {t('MCP')}
          </Badge>
        </button>
      ))}
    </div>
  );
}
