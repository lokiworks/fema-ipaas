import { McpServer } from '@fema-ipaas/shared';
import { t } from 'i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { McpServerForm } from './mcp-server-form';

export function McpServerDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: McpServer;
  onSaved: (server: McpServer) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {existing ? t('Edit connection settings') : t('Add an MCP server')}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? t(
                  'Change the address, authentication or scope of "{name}". Changing the address or authentication requires a new connection test.',
                  { name: existing.displayName },
                )
              : t(
                  'Bring in an MCP server your company already runs. Its tools can be used as steps in workflows and by AI agents.',
                )}
          </DialogDescription>
        </DialogHeader>
        <McpServerForm
          key={open ? `open-${existing?.id ?? 'new'}` : 'closed'}
          existing={existing}
          onDone={(server) => {
            onOpenChange(false);
            if (server) {
              onSaved(server);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
