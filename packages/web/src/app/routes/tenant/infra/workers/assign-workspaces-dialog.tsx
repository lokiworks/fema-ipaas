import { WorkspaceWithLimits } from '@fema/shared';
import { t } from 'i18next';
import { Layers, Search } from 'lucide-react';
import { useState } from 'react';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { workspaceCollectionUtils } from '@/features/workspaces/stores/workspace-collection';
import { cn } from '@/lib/utils';

import { WorkspaceAvatar } from './workspace-avatar';

export function AssignWorkspacesDialog({
  open,
  onOpenChange,
  groupLabel,
  allWorkspaces,
}: AssignWorkspacesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <AssignWorkspacesContent
          key={open ? `open-${groupLabel}` : 'closed'}
          groupLabel={groupLabel}
          allWorkspaces={allWorkspaces}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function AssignWorkspacesContent({
  groupLabel,
  allWorkspaces,
  onOpenChange,
}: AssignWorkspacesContentProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () =>
      new Set(
        allWorkspaces
          .filter((p) => p.workerGroupId === groupLabel)
          .map((p) => p.id),
      ),
  );
  const [search, setSearch] = useState('');

  const filteredWorkspaces = allWorkspaces.filter((p) =>
    p.displayName.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleWorkspace = (workspaceId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    for (const workspace of allWorkspaces) {
      const wasInGroup = workspace.workerGroupId === groupLabel;
      const isNowChecked = checkedIds.has(workspace.id);
      if (isNowChecked && !wasInGroup) {
        await workspaceCollectionUtils.update(workspace.id, {
          workerGroupId: groupLabel,
        });
      } else if (!isNowChecked && wasInGroup) {
        await workspaceCollectionUtils.update(workspace.id, {
          workerGroupId: null,
        });
      }
    }
    onOpenChange(false);
  };

  const getSubtitle = (workspace: WorkspaceWithLimits): string => {
    if (workspace.workerGroupId === groupLabel) {
      return t('in this group');
    }
    if (workspace.workerGroupId) {
      return t('currently in {group} — will move here', {
        group: workspace.workerGroupId.replaceAll('_', ' '),
      });
    }
    return t('shared queue');
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('Assign workspaces')}</DialogTitle>
        <DialogDescription>
          {t("These workspaces will run on this group's dedicated queue.")}
        </DialogDescription>
        <div className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-sm font-medium text-primary w-fit">
          <Layers className="size-3.5 shrink-0" />
          {groupLabel.replaceAll('_', ' ')}
        </div>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t('Search workspaces')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="h-64 rounded-md border">
          <div className="p-1">
            {filteredWorkspaces.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('No workspaces')}
              </p>
            )}
            {filteredWorkspaces.map((workspace) => {
              const isChecked = checkedIds.has(workspace.id);
              const subtitle = getSubtitle(workspace);
              const isCurrentGroup = workspace.workerGroupId === groupLabel;

              return (
                <button
                  key={workspace.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent cursor-pointer"
                  onClick={() => toggleWorkspace(workspace.id)}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggleWorkspace(workspace.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <WorkspaceAvatar workspace={workspace} />
                  <div className="flex min-w-0 flex-col">
                    <TextWithTooltip tooltipMessage={workspace.displayName}>
                      <span className="text-sm font-medium truncate">
                        {workspace.displayName}
                      </span>
                    </TextWithTooltip>
                    <span
                      className={cn('text-xs text-muted-foreground truncate', {
                        'text-primary': isCurrentGroup,
                      })}
                    >
                      {subtitle}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <DialogFooter className="sm:justify-between">
        <span className="text-sm text-muted-foreground self-center">
          {checkedIds.size}{' '}
          {checkedIds.size === 1 ? t('Workspace') : t('Workspaces')}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="button" onClick={handleSave}>
            {t('Save')}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

type AssignWorkspacesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupLabel: string;
  allWorkspaces: WorkspaceWithLimits[];
};

type AssignWorkspacesContentProps = {
  groupLabel: string;
  allWorkspaces: WorkspaceWithLimits[];
  onOpenChange: (open: boolean) => void;
};
