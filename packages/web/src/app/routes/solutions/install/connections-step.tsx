import { isNil } from '@fema-ipaas/core-utils';
import {
  ConnectionStatus,
  ConnectionWithoutSensitiveData,
  SolutionConnectionSlot,
  SolutionPackage,
} from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { CreateOrEditConnectionDialog } from '@/app/connections/create-edit-connection-dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { connectionUtils } from '@/features/connections';
import { ConnectorDisplayName, connectorsHooks } from '@/features/connectors';
import {
  SolutionConnectorIcons,
  solutionsHooks,
  solutionsUtils,
} from '@/features/solutions';

import { WizardFooter } from './wizard-parts';

function ConnectionsStep({
  pkg,
  projectId,
  connections,
  onBack,
  onNext,
}: ConnectionsStepProps) {
  const [chosen, setChosen] = useState(connections);
  const { isLoading, byConnector } = solutionsHooks.useSlotConnections({
    projectId,
    connectorNames: pkg.connections.map((slot) => slot.connectorName),
  });
  const effective = solutionsUtils.effectiveConnections({
    slots: pkg.connections,
    selected: chosen,
    available: byConnector,
  });
  const missing = solutionsUtils.missingSlots({
    slots: pkg.connections,
    connections: effective,
  });
  const hasBrokenSelection = pkg.connections.some((slot) =>
    isBroken({
      connections: byConnector[slot.connectorName] ?? [],
      externalId: effective[slot.connectorName],
    }),
  );

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t(
          'The workflows use the connections you pick here. Reuse an existing connection or create a new one.',
        )}
      </p>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        pkg.connections.map((slot) => (
          <SlotRow
            key={slot.connectorName}
            slot={slot}
            pkg={pkg}
            projectId={projectId}
            available={byConnector[slot.connectorName] ?? []}
            externalId={effective[slot.connectorName]}
            onSelect={(externalId) =>
              setChosen({ ...chosen, [slot.connectorName]: externalId })
            }
          />
        ))
      )}
      <WizardFooter
        onBack={onBack}
        nextDisabled={isLoading || missing.length > 0 || hasBrokenSelection}
        onNext={() => onNext(effective)}
      />
    </div>
  );
}

function SlotRow({
  slot,
  pkg,
  projectId,
  available,
  externalId,
  onSelect,
}: SlotRowProps) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { connectorModel } = connectorsHooks.useConnector({
    name: slot.connectorName,
    projectId,
  });
  const broken = isBroken({ connections: available, externalId });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <SolutionConnectorIcons
          connectorNames={[slot.connectorName]}
          size="md"
        />
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">
            <ConnectorDisplayName connectorName={slot.connectorName} />
          </span>
          <span className="text-xs text-muted-foreground">
            {t('Used by: {names}', {
              names: solutionsUtils.workflowNamesOf({ slot, pkg }).join(', '),
            })}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select value={externalId ?? ''} onValueChange={onSelect}>
          <SelectTrigger className="w-80">
            <SelectValue
              placeholder={
                available.length > 0
                  ? t('Select a connection')
                  : t('No connection available yet')
              }
            />
          </SelectTrigger>
          <SelectContent>
            {available.map((connection) => (
              <SelectItem
                key={connection.externalId}
                value={connection.externalId}
              >
                <ConnectionOption connection={connection} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={isNil(connectorModel)}
          onClick={() => setCreating(true)}
        >
          <Plus className="size-4" />
          {t('Create connection')}
        </Button>
      </div>
      {broken && (
        <p className="text-xs text-destructive">
          {t(
            'This connection is not working. Reconnect it on the Connections page, or pick another one.',
          )}
        </p>
      )}
      {connectorModel && (
        <CreateOrEditConnectionDialog
          key={`create-${slot.connectorName}-${creating}`}
          connector={connectorModel}
          open={creating}
          reconnectConnection={null}
          isGlobalConnection={false}
          projectId={projectId}
          setOpen={(open, connection) => {
            setCreating(open);
            if (connection) {
              void queryClient.invalidateQueries({ queryKey: ['connections'] });
              onSelect(connection.externalId);
            }
          }}
        />
      )}
    </div>
  );
}

function ConnectionOption({
  connection,
}: {
  connection: ConnectionWithoutSensitiveData;
}) {
  const account = connectionUtils.getConnectionAccountIdentifier(connection);
  return (
    <span className="flex items-center gap-2">
      <span className="truncate">{connection.displayName}</span>
      {account && (
        <span className="truncate text-xs text-muted-foreground">
          {account}
        </span>
      )}
      {connection.status !== ConnectionStatus.ACTIVE && (
        <span className="text-xs text-destructive">
          {connectionUtils.getStatusLabel(connection.status)}
        </span>
      )}
    </span>
  );
}

function isBroken({
  connections,
  externalId,
}: {
  connections: ConnectionWithoutSensitiveData[];
  externalId: string | undefined;
}): boolean {
  const selected = connections.find(
    (connection) => connection.externalId === externalId,
  );
  return !isNil(selected) && selected.status !== ConnectionStatus.ACTIVE;
}

export { ConnectionsStep };

type ConnectionsStepProps = {
  pkg: SolutionPackage;
  projectId: string;
  connections: Record<string, string>;
  onBack: () => void;
  onNext: (connections: Record<string, string>) => void;
};

type SlotRowProps = {
  slot: SolutionConnectionSlot;
  pkg: SolutionPackage;
  projectId: string;
  available: ConnectionWithoutSensitiveData[];
  externalId: string | undefined;
  onSelect: (externalId: string) => void;
};
