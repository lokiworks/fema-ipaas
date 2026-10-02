import { isNil } from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
  connectionsMutations,
  connectionsQueries,
} from '@/features/connections/hooks/connections-hooks';
import { connectionAccessUiUtils } from '@/features/connections/utils/connection-access-utils';

export function DeleteConnectionDialog({
  connectionId,
  open,
  onOpenChange,
  onDeleted,
}: {
  connectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DeleteConnectionContent
          key={open ? 'open' : 'closed'}
          connectionId={connectionId}
          onCancel={() => onOpenChange(false)}
          onDeleted={() => {
            onOpenChange(false);
            onDeleted();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeleteConnectionContent({
  connectionId,
  onCancel,
  onDeleted,
}: {
  connectionId: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const { data: detail } = connectionsQueries.useConnectionDetail({
    connectionId,
  });
  const { mutate: deleteConnection, isPending } =
    connectionsMutations.useDeleteAccessibleConnection();

  if (isNil(detail)) {
    return null;
  }

  const consequences = connectionAccessUiUtils.buildDeleteConsequences({
    workflows: detail.references.workflows,
    hiddenWorkflowCount: detail.references.hiddenWorkflowCount,
    mcpServiceCount:
      detail.references.mcpServices.length +
      detail.references.hiddenMcpServiceCount,
    projectConfigCount:
      detail.references.projectConfigs.length +
      detail.references.hiddenProjectConfigCount,
    shareCount: detail.shareCount,
  });
  const nameMatches = confirmText.trim() === detail.displayName;
  const inUse =
    consequences.workflowCount +
      consequences.mcpServiceCount +
      consequences.projectConfigCount >
    0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {inUse
            ? t('Cannot delete "{name}"', { name: detail.displayName })
            : t('Delete "{name}"?', { name: detail.displayName })}
        </DialogTitle>
        <DialogDescription>
          {inUse
            ? t(
                'It is still in use. Replace it where it is used before deleting it, otherwise those places stop working.',
              )
            : t('This cannot be undone.')}
        </DialogDescription>
      </DialogHeader>
      <Alert variant="warning">
        <TriangleAlert className="h-4 w-4" />
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              {consequences.workflowCount > 0
                ? t(
                    '{count} workflows are using this connection ({names}{more}). Runs that reach those steps will fail until a new connection is selected.',
                    {
                      count: consequences.workflowCount,
                      names: consequences.workflowSampleNames
                        .map((name) => `"${name}"`)
                        .join('、'),
                      more: consequences.hasMoreWorkflows ? t(' and more') : '',
                    },
                  )
                : t('No workflows are currently using this connection.')}
            </li>
            {consequences.mcpServiceCount > 0 && (
              <li>
                {t(
                  '{count} MCP services use it as a fixed connection; their tools will stop working.',
                  { count: consequences.mcpServiceCount },
                )}
              </li>
            )}
            {consequences.projectConfigCount > 0 && (
              <li>
                {t('{count} project configs reference this connection.', {
                  count: consequences.projectConfigCount,
                })}
              </li>
            )}
            {consequences.shareCount > 0 && (
              <li>
                {t(
                  '{count} members it was shared with will no longer be able to use it.',
                  {
                    count: consequences.shareCount,
                  },
                )}
              </li>
            )}
          </ul>
        </AlertDescription>
      </Alert>
      {!inUse && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-connection-confirm">
            {t('Type "{name}" to confirm', { name: detail.displayName })}
          </Label>
          <Input
            id="delete-connection-confirm"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            autoComplete="off"
          />
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {inUse ? t('Got it') : t('Cancel')}
        </Button>
        {!inUse && (
          <Button
            type="button"
            variant="destructive"
            disabled={!nameMatches}
            loading={isPending}
            onClick={() =>
              deleteConnection(connectionId, {
                onSuccess: onDeleted,
              })
            }
          >
            {t('Delete')}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
