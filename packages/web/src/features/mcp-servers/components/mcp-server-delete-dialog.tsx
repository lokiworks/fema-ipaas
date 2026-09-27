import { McpServer, McpServerUsageKind } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

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
import {
  mcpServersHooks,
  mcpServersMutations,
} from '@/features/mcp-servers/hooks/mcp-servers-hooks';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

export function McpServerDeleteDialog({
  server,
  open,
  onOpenChange,
}: {
  server: McpServer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { data: usage } = mcpServersHooks.useMcpServerUsage(
    open ? server.id : '',
  );
  const [confirmText, setConfirmText] = useState('');
  const { mutate: deleteServer, isPending } =
    mcpServersMutations.useDeleteMcpServer({
      onSuccess: () => {
        onOpenChange(false);
        navigate('/tenant/connectors?cat=mcp');
      },
      onError: (error) => {
        toast.error(
          api.extractServerErrorMessage(
            error,
            'Failed to delete the MCP server',
          ),
        );
      },
    });

  const blocked = (usage?.workflows.length ?? 0) > 0;
  const nameMatches = confirmText.trim() === server.displayName;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setConfirmText('');
        onOpenChange(next);
      }}
    >
      <DialogContent>
        {blocked ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('Cannot delete "{name}"', { name: server.displayName })}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'Workflows still use its tools; deleting it would make those workflows fail.',
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1">
              {usage?.workflows.map((workflow) => (
                <button
                  key={workflow.workflowId}
                  type="button"
                  className="flex items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(
                      authenticationSession.appendProjectRoutePrefix(
                        `/workflows/${workflow.workflowId}`,
                      ),
                    );
                  }}
                >
                  <div className="flex min-w-0 grow flex-col">
                    <span className="truncate">{workflow.displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {workflow.items
                        .map((item) =>
                          item.kind === McpServerUsageKind.AGENT
                            ? t('agent tool "{name}"', {
                                name: item.stepDisplayName,
                              })
                            : t('step "{name}"', {
                                name: item.stepDisplayName,
                              }),
                        )
                        .join('、')}
                    </span>
                  </div>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </button>
              ))}
              {usage && usage.hiddenWorkflowCount > 0 && (
                <p className="px-2 text-xs text-muted-foreground">
                  {t(
                    'Another {count} workflows are in projects you cannot see; ask their owners to remove the reference.',
                    { count: usage.hiddenWorkflowCount },
                  )}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{t('Got it')}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('Delete "{name}"?', { name: server.displayName })}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'No workflow uses it. Once deleted, its tools disappear from the step picker and from agent tool lists.',
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mcp-server-delete-confirm">
                {t('Type "{name}" to confirm', { name: server.displayName })}
              </Label>
              <Input
                id="mcp-server-delete-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t('Cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!nameMatches}
                loading={isPending}
                onClick={() => deleteServer(server.id)}
              >
                {t('Delete')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
