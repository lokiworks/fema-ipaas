import { AccessibleConnection } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ChevronRight, Workflow } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { connectionsQueries } from '@/features/connections/hooks/connections-hooks';
import { projectCollectionUtils } from '@/features/projects';
import { cn } from '@/lib/utils';

export function ConnectionUsagePopover({
  connection,
}: {
  connection: AccessibleConnection;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const workflowCount = connection.workflowIds?.length ?? 0;
  const { data: myProjects } = projectCollectionUtils.useAll();
  const myProjectIds = new Set(myProjects.map((project) => project.id));
  const { data: detail, isLoading } = connectionsQueries.useConnectionDetail({
    connectionId: connection.id,
    enabled: open,
  });

  if (workflowCount === 0) {
    return (
      <span className="text-muted-foreground text-sm">
        {t('Not referenced')}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={(event) => event.stopPropagation()}
        >
          {t('{count} workflows', { count: workflowCount })}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-2"
        align="start"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-2 py-1 text-sm font-medium">
          {t('Workflows using "{name}"', { name: connection.displayName })}
        </div>
        <ScrollArea viewPortClassName="max-h-64">
          {isLoading && (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              {t('Loading')}
            </div>
          )}
          {detail?.references.workflows.map((workflow) => {
            const allowed = myProjectIds.has(workflow.projectId);
            return (
              <button
                key={workflow.workflowId}
                type="button"
                disabled={!allowed}
                onClick={() => {
                  if (!allowed) return;
                  setOpen(false);
                  navigate(
                    `/projects/${workflow.projectId}/workflows/${workflow.workflowId}`,
                  );
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                  {
                    'cursor-not-allowed opacity-60 hover:bg-transparent':
                      !allowed,
                  },
                )}
              >
                <Workflow className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{workflow.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {allowed
                      ? workflow.projectDisplayName
                      : t("You're not a member of this project")}
                  </span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
          {detail && detail.references.hiddenWorkflowCount > 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {t('And {count} more workflows you cannot view', {
                count: detail.references.hiddenWorkflowCount,
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
