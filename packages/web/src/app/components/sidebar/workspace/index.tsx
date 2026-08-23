import { isNil } from '@fema/core-utils';
import {
  WORKSPACE_COLOR_PALETTE,
  WorkspaceType,
  WorkspaceWithLimits,
} from '@fema/shared';
import { User } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar-shadcn';
import { getWorkspaceName } from '@/features/workspaces';
import { cn } from '@/lib/utils';

const MAX_LENGTH_TO_NOT_SHOW_TOOLTIP = 28;

type WorkspaceSideBarItemProps = {
  workspace: WorkspaceWithLimits;
  isCurrentWorkspace: boolean;
  handleWorkspaceSelect: (workspaceId: string) => void;
};

const WorkspaceSideBarItem = ({
  workspace,
  isCurrentWorkspace,
  handleWorkspaceSelect,
}: WorkspaceSideBarItemProps) => {
  const { state } = useSidebar();

  const workspaceName = getWorkspaceName(workspace);

  const workspaceAvatar = isNil(workspace.icon) ? null : workspace.type ===
    WorkspaceType.TEAM ? (
    <Avatar
      className="size-[18px] text-sm font-bold flex items-center justify-center rounded-[4px]"
      style={{
        backgroundColor: WORKSPACE_COLOR_PALETTE[workspace.icon.color].color,
        color: WORKSPACE_COLOR_PALETTE[workspace.icon.color].textColor,
      }}
    >
      <span className="scale-75">{workspaceName.charAt(0).toUpperCase()}</span>
    </Avatar>
  ) : (
    <User className="size-4 " />
  );

  const shouldShowTooltip =
    workspaceName.length > MAX_LENGTH_TO_NOT_SHOW_TOOLTIP;
  const displayText = shouldShowTooltip
    ? `${workspaceName.substring(0, MAX_LENGTH_TO_NOT_SHOW_TOOLTIP)}...`
    : workspaceName;
  const isCollapsed = state === 'collapsed';
  return (
    <SidebarMenuButton
      onClick={() => handleWorkspaceSelect(workspace.id)}
      className={cn('', {
        'bg-sidebar-accent! ': isCurrentWorkspace,
      })}
    >
      {workspaceAvatar}
      {!isCollapsed && (
        <span
          className={cn('truncate', { 'font-semibold': isCurrentWorkspace })}
        >
          {displayText}
        </span>
      )}
    </SidebarMenuButton>
  );
};

export default WorkspaceSideBarItem;
