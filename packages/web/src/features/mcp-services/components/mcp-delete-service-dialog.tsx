import { McpService } from '@fema-ipaas/shared';
import { t } from 'i18next';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';

function McpDeleteServiceDialog({
  service,
  open,
  onOpenChange,
  onDeleted,
}: {
  service: McpService;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DeleteConfirmation
          key={open ? 'open' : 'closed'}
          service={service}
          onOpenChange={onOpenChange}
          onDeleted={onDeleted}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmation({
  service,
  onOpenChange,
  onDeleted,
}: {
  service: McpService;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState('');
  const { mutate: deleteService, isPending } =
    mcpServicesHooks.useDeleteService();
  const matches = typed === service.name;
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          {t('Delete "{name}"?', { name: service.name })}
        </DialogTitle>
        <DialogDescription>
          {t(
            'AI assistants currently using this service immediately lose these tools. This cannot be undone.',
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-mcp-service-name">
          {t('Type {name} to confirm', { name: service.name })}
        </Label>
        <Input
          id="confirm-mcp-service-name"
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => onOpenChange(false)}
        >
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={!matches}
          loading={isPending}
          onClick={() =>
            deleteService(service.id, {
              onSuccess: () => {
                onOpenChange(false);
                onDeleted();
              },
            })
          }
        >
          {t('Delete')}
        </Button>
      </DialogFooter>
    </div>
  );
}

export { McpDeleteServiceDialog };
