import { isNil } from '@fema-ipaas/core-utils';
import {
  ConnectionOwnershipFilter,
  McpCredentialMode,
  McpService,
  McpServiceIssue,
  McpToolSourceType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useMemo, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { connectionsQueries } from '@/features/connections';
import {
  ConnectorIconWithConnectorName,
  connectorsHooks,
} from '@/features/connectors';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';
import { mcpServiceUiUtils } from '../utils/mcp-service-ui-utils';

const MODES = [
  McpCredentialMode.DEVELOPER,
  McpCredentialMode.CONSUMER,
  McpCredentialMode.USER,
];

function McpConnectionsTab({
  service,
  canEdit,
  issues,
}: {
  service: McpService;
  canEdit: boolean;
  issues: McpServiceIssue[];
}) {
  const connectorNames = useMemo(
    () =>
      [
        ...new Set(
          service.tools
            .filter(
              (tool) => tool.source.type === McpToolSourceType.CONNECTOR_ACTION,
            )
            .map((tool) =>
              tool.source.type === McpToolSourceType.CONNECTOR_ACTION
                ? tool.source.connectorName
                : '',
            ),
        ),
      ].filter(Boolean),
    [service.tools],
  );
  const { summaries } = connectorsHooks.useConnectorSummariesByNames({
    names: connectorNames,
  });
  const authConnectorNames = summaries
    .filter((summary) => !isNil(summary.auth))
    .map((summary) => summary.name);

  const [mode, setMode] = useState(service.credentialMode);
  const [fixed, setFixed] = useState(service.fixedConnections);
  const dirty =
    mode !== service.credentialMode ||
    authConnectorNames.some(
      (name) =>
        (fixed[name] ?? null) !== (service.fixedConnections[name] ?? null),
    );
  const { mutate: save, isPending } = mcpServicesHooks.useUpdateConnections(
    service.id,
  );

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <RadioGroup
        value={mode}
        disabled={!canEdit}
        onValueChange={(value) => setMode(value as McpCredentialMode)}
        className="flex flex-col gap-2"
      >
        {MODES.map((option) => (
          <label
            key={option}
            className="flex items-start gap-3 rounded-md border p-3"
          >
            <RadioGroupItem value={option} className="mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {mcpServiceUiUtils.credentialModeLabel(option)}
              </span>
              <span className="text-xs text-muted-foreground">
                {mcpServiceUiUtils.credentialModeDescription(option)}
              </span>
            </div>
          </label>
        ))}
      </RadioGroup>
      {authConnectorNames.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {service.tools.length > 0
            ? t(
                "This service's tools do not need a connection: workflow tools use the connections configured inside the workflow.",
              )
            : t('Add a connector tool, then configure its connection here.')}
        </p>
      ) : (
        mode === McpCredentialMode.DEVELOPER && (
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">
              {t('Choose a fixed connection for each connector')}
            </span>
            {authConnectorNames.map((connectorName) => (
              <FixedConnectionRow
                key={connectorName}
                service={service}
                connectorName={connectorName}
                canEdit={canEdit}
                value={fixed[connectorName] ?? null}
                onChange={(value) =>
                  setFixed((current) => ({
                    ...current,
                    [connectorName]: value ?? '',
                  }))
                }
                issues={issues}
              />
            ))}
          </div>
        )
      )}
      {authConnectorNames.length > 0 && mode === McpCredentialMode.CONSUMER && (
        <Alert>
          <AlertDescription>
            {t(
              'Teams that obtain this service each choose their own connection for these connectors.',
            )}
          </AlertDescription>
        </Alert>
      )}
      {authConnectorNames.length > 0 && mode === McpCredentialMode.USER && (
        <Alert>
          <AlertDescription>
            {t(
              'The first time a user calls a tool that needs one of these connectors, the client prompts them to pick their own account here.',
            )}
          </AlertDescription>
        </Alert>
      )}
      {authConnectorNames.length > 0 &&
        (service.credentialMode === McpCredentialMode.CONSUMER ||
          service.credentialMode === McpCredentialMode.USER) && (
          <MyConnectionsSection
            service={service}
            connectorNames={authConnectorNames}
            ownedOnly={service.credentialMode === McpCredentialMode.USER}
          />
        )}
      {canEdit && (
        <div className="flex items-center justify-end gap-2 border-t pt-3">
          {dirty && (
            <span className="text-xs text-muted-foreground">
              {t('Unsaved changes')}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!dirty}
            onClick={() => {
              setMode(service.credentialMode);
              setFixed(service.fixedConnections);
            }}
          >
            {t('Cancel')}
          </Button>
          <Button
            type="button"
            disabled={!dirty}
            loading={isPending}
            onClick={() =>
              save({
                credentialMode: mode,
                fixedConnections: Object.fromEntries(
                  authConnectorNames
                    .filter((name) => fixed[name])
                    .map((name) => [name, fixed[name]]),
                ),
              })
            }
          >
            {t('Save')}
          </Button>
        </div>
      )}
    </div>
  );
}

function FixedConnectionRow({
  service,
  connectorName,
  canEdit,
  value,
  onChange,
  issues,
}: {
  service: McpService;
  connectorName: string;
  canEdit: boolean;
  value: string | null;
  onChange: (value: string | null) => void;
  issues: McpServiceIssue[];
}) {
  const { data } = connectionsQueries.useAccessibleConnections({
    request: { connectorName, availableInProjectId: service.projectId },
    extraKeys: ['mcp-service', service.id, connectorName],
  });
  const connections = data?.data ?? [];
  const issue = issues.find(
    (candidate) => candidate.connectorName === connectorName,
  );
  return (
    <div className="flex flex-col gap-1">
      <Label className="flex items-center gap-2">
        <ConnectorIconWithConnectorName
          connectorName={connectorName}
          size="xs"
          showTooltip={false}
        />
        {connectorName}
      </Label>
      {canEdit ? (
        connections.length > 0 ? (
          <Select value={value ?? undefined} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('Choose a connection')} />
            </SelectTrigger>
            <SelectContent>
              {connections.map((connection) => (
                <SelectItem key={connection.id} value={connection.id}>
                  {connection.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('No usable connection for this connector yet')}
          </p>
        )
      ) : (
        <p className="text-sm">
          {connections.find((connection) => connection.id === value)
            ?.displayName ?? t('Not selected')}
        </p>
      )}
      {issue && (
        <p className="text-xs text-destructive">
          {mcpServiceUiUtils.issueMessage(issue)}
        </p>
      )}
    </div>
  );
}

function MyConnectionsSection({
  service,
  connectorNames,
  ownedOnly,
}: {
  service: McpService;
  connectorNames: string[];
  ownedOnly: boolean;
}) {
  const { data: membership } = mcpServicesHooks.useMembership({
    id: service.id,
    enabled: true,
  });
  const [connections, setConnections] = useState<Record<string, string>>({});
  const saved = membership?.connections ?? {};
  const current = { ...saved, ...connections };
  const dirty = connectorNames.some(
    (name) => (connections[name] ?? saved[name] ?? '') !== (saved[name] ?? ''),
  );
  const { mutate: save, isPending } = mcpServicesHooks.useUpdateMyConnections(
    service.id,
  );
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <span className="text-sm font-medium">{t('My connections')}</span>
      <p className="text-xs text-muted-foreground">
        {ownedOnly
          ? t('Pick one of your own connections for each connector below.')
          : t('Pick the connection you want to use for each connector below.')}
      </p>
      {connectorNames.map((connectorName) => (
        <MyConnectionRow
          key={connectorName}
          service={service}
          connectorName={connectorName}
          ownedOnly={ownedOnly}
          value={current[connectorName] ?? null}
          onChange={(value) =>
            setConnections((prev) => ({
              ...prev,
              [connectorName]: value ?? '',
            }))
          }
        />
      ))}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          disabled={!dirty}
          loading={isPending}
          onClick={() =>
            save({
              connections: Object.fromEntries(
                connectorNames
                  .filter((name) => current[name])
                  .map((name) => [name, current[name]]),
              ),
            })
          }
        >
          {t('Save')}
        </Button>
      </div>
    </div>
  );
}

function MyConnectionRow({
  service,
  connectorName,
  ownedOnly,
  value,
  onChange,
}: {
  service: McpService;
  connectorName: string;
  ownedOnly: boolean;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { data } = connectionsQueries.useAccessibleConnections({
    request: {
      connectorName,
      availableInProjectId: service.projectId,
      ownership: ownedOnly ? ConnectionOwnershipFilter.MINE : undefined,
    },
    extraKeys: [
      'mcp-service-my-connections',
      service.id,
      connectorName,
      ownedOnly,
    ],
  });
  const connections = data?.data ?? [];
  return (
    <div className="flex items-center gap-2">
      <Label className="flex w-32 items-center gap-2">
        <ConnectorIconWithConnectorName
          connectorName={connectorName}
          size="xs"
          showTooltip={false}
        />
        {connectorName}
      </Label>
      {connections.length > 0 ? (
        <Select value={value ?? undefined} onValueChange={onChange}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={t('Choose a connection')} />
          </SelectTrigger>
          <SelectContent>
            {connections.map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {connection.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('No usable connection for this connector yet')}
        </p>
      )}
    </div>
  );
}

export { McpConnectionsTab };
