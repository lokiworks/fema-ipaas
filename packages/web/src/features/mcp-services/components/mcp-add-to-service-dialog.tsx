import { McpService } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Plus, Server } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  ConnectorIconWithConnectorName,
  connectorsHooks,
} from '@/features/connectors';

const NEW_SERVICE = '__new__';

function McpAddToServiceDialog({
  connectorName,
  actionName,
  services,
  onClose,
  onPickExisting,
  onCreateNew,
}: {
  connectorName: string;
  actionName: string;
  services: McpService[];
  onClose: () => void;
  onPickExisting: (serviceId: string) => void;
  onCreateNew: () => void;
}) {
  const [target, setTarget] = useState(services[0]?.id ?? NEW_SERVICE);
  const { connectorModel } = connectorsHooks.useConnector({
    name: connectorName,
  });
  const action = connectorModel?.actions[actionName];

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Expose as an MCP tool')}</DialogTitle>
          <DialogDescription>
            {t('Choose which MCP service to add this action to')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
          <ConnectorIconWithConnectorName
            connectorName={connectorName}
            size="xs"
            showTooltip={false}
          />
          <span>{connectorModel?.displayName ?? connectorName}</span>
          <span className="text-muted-foreground">·</span>
          <span>{action?.displayName ?? actionName}</span>
        </div>
        <RadioGroup
          value={target}
          onValueChange={setTarget}
          className="flex flex-col gap-2"
        >
          {services.map((service) => (
            <label
              key={service.id}
              className="flex items-start gap-3 rounded-md border p-3"
            >
              <RadioGroupItem value={service.id} className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{service.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t('{count} tools', { count: service.tools.length })}
                </span>
              </div>
            </label>
          ))}
          <label className="flex items-start gap-3 rounded-md border p-3">
            <RadioGroupItem value={NEW_SERVICE} className="mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1 text-sm font-medium">
                <Plus className="size-3.5" />
                {t('Create a new MCP service')}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(
                  'Fill in the service info first, then add this action as a tool',
                )}
              </span>
            </div>
          </label>
        </RadioGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            type="button"
            onClick={() =>
              target === NEW_SERVICE ? onCreateNew() : onPickExisting(target)
            }
          >
            <Server className="size-4 mr-1" />
            {target === NEW_SERVICE
              ? t('Next: create service')
              : t('Next: confirm tool')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { McpAddToServiceDialog };
