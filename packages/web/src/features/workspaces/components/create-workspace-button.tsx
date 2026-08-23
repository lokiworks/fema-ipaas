import { WorkspaceWithLimits } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Plus } from 'lucide-react';

import { AnimatedIconButton } from '@/components/custom/animated-icon-button';
import { PlusIcon } from '@/components/icons/plus';
import { Button } from '@/components/ui/button';
import { SidebarMenuButton } from '@/components/ui/sidebar-shadcn';

import { NewWorkspaceDialog } from './new-workspace-dialog';

export function CreateWorkspaceButton({
  variant,
  onCreate,
}: CreateWorkspaceButtonProps) {
  const hasReachedLimit = false;
  const ensureTeamWorkspaceAvailable = () => undefined;
  const teamWorkspaceLimitDialog = null;

  const trigger = triggerFor({
    variant,
    onClick: hasReachedLimit ? () => ensureTeamWorkspaceAvailable() : undefined,
  });

  return (
    <>
      {hasReachedLimit ? (
        trigger
      ) : (
        <NewWorkspaceDialog onCreate={onCreate}>{trigger}</NewWorkspaceDialog>
      )}
      {teamWorkspaceLimitDialog}
    </>
  );
}

function triggerFor({ variant, onClick }: TriggerForParams) {
  switch (variant) {
    case 'icon':
      return (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:bg-accent"
          onClick={onClick}
        >
          <Plus />
        </Button>
      );
    case 'full':
      return (
        <AnimatedIconButton
          icon={PlusIcon}
          iconSize={16}
          size="sm"
          onClick={onClick}
        >
          {t('New Workspace')}
        </AnimatedIconButton>
      );
    case 'sidebar-menu':
      return (
        <SidebarMenuButton
          className="text-muted-foreground gap-2"
          onClick={onClick}
        >
          <Plus className="size-4" />
          <span>{t('Add team workspace')}</span>
        </SidebarMenuButton>
      );
  }
}

type CreateWorkspaceButtonVariant = 'icon' | 'full' | 'sidebar-menu';

type TriggerForParams = {
  variant: CreateWorkspaceButtonVariant;
  onClick?: () => void;
};

type CreateWorkspaceButtonProps = {
  variant: CreateWorkspaceButtonVariant;
  workspaces: Pick<WorkspaceWithLimits, 'type'>[];
  onCreate?: (workspace: WorkspaceWithLimits) => void;
};
