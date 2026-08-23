import { t } from 'i18next';
import { Pin, PinOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { platformConnectorsMutations } from '@/features/platform-admin';
import { platformHooks } from '@/hooks/platform-hooks';

type ConnectorActionsProps = {
  connectorName: string;
  isEnabled: boolean;
};

const ConnectorActions = ({
  connectorName,
  isEnabled,
}: ConnectorActionsProps) => {
  const { platform, refetch } = platformHooks.useCurrentPlatform();

  const { mutate: togglePin, isPending: isPinPending } =
    platformConnectorsMutations.useToggleConnectorPin({
      platformId: platform.id,
      pinnedConnectors: platform.pinnedConnectors,
      refetch,
    });

  const pinned = platform.pinnedConnectors.includes(connectorName);

  return (
    <div className="flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={'sm'}
            loading={isPinPending}
            disabled={!isEnabled}
            onClick={(e) => {
              if (!isEnabled) {
                e.preventDefault();
                return;
              }
              togglePin(connectorName);
            }}
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
