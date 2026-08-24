import { t } from 'i18next';
import { Pin, PinOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { tenantConnectorsMutations } from '@/features/tenant-admin';
import { tenantHooks } from '@/hooks/tenant-hooks';

type ConnectorActionsProps = {
  connectorName: string;
};

const ConnectorActions = ({ connectorName }: ConnectorActionsProps) => {
  const { tenant, refetch } = tenantHooks.useCurrentTenant();

  const { mutate: togglePin, isPending: isPinPending } =
    tenantConnectorsMutations.useToggleConnectorPin({
      tenantId: tenant.id,
      pinnedConnectors: tenant.pinnedConnectors,
      refetch,
    });

  const pinned = tenant.pinnedConnectors.includes(connectorName);

  return (
    <div className="flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={'sm'}
            loading={isPinPending}
            onClick={() => togglePin(connectorName)}
          >
            {pinned ? (
              <PinOff className="size-4" />
            ) : (
              <Pin className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {pinned ? t('Unpin this connector') : t('Pin this connector')}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

ConnectorActions.displayName = 'ConnectorActions';

export { ConnectorActions };
