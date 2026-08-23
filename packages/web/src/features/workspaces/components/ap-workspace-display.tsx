import { isNil } from '@fema/core-utils';
import {
  WORKSPACE_COLOR_PALETTE,
  WorkspaceIcon,
  WorkspaceType,
} from '@fema/shared';
import { User } from 'lucide-react';
import { useContext } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { SidebarContext } from '@/components/ui/sidebar-shadcn';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function useSidebarSafe(): string {
  const context = useContext(SidebarContext);
  return context?.state ?? 'expanded';
}

type ApWorkspaceDisplayProps = {
  title: string;
  icon?: WorkspaceIcon;
  containerClassName?: string;
  titleClassName?: string;
  iconClassName?: string;
  maxLengthToNotShowTooltip?: number;
  workspaceType: WorkspaceType;
  inSidebar?: boolean;
  framePersonalIcon?: boolean;
};

export const ApWorkspaceDisplay = ({
  title,
  icon,
  containerClassName = '',
  titleClassName = '',
  iconClassName,
  maxLengthToNotShowTooltip = 30,
  workspaceType,
  inSidebar = false,
  framePersonalIcon = false,
}: ApWorkspaceDisplayProps) => {
  const sidebarState = useSidebarSafe();
  const workspaceAvatar = isNil(icon) ? null : workspaceType ===
    WorkspaceType.TEAM ? (
    <Avatar
      className={cn(
        'size-6 flex items-center justify-center rounded-sm',
        iconClassName,
      )}
      style={{
        backgroundColor: WORKSPACE_COLOR_PALETTE[icon.color].color,
        color: WORKSPACE_COLOR_PALETTE[icon.color].textColor,
      }}
    >
      {title.charAt(0).toUpperCase()}
    </Avatar>
  ) : framePersonalIcon ? (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-muted-foreground',
        iconClassName,
      )}
    >
      <User className="size-5" />
    </span>
  ) : (
    <User
      className={cn('size-5 flex items-center justify-center', iconClassName)}
    />
  );

  const shouldShowTooltip = title.length > maxLengthToNotShowTooltip;
  const displayText = shouldShowTooltip
    ? `${title.substring(0, maxLengthToNotShowTooltip)}...`
    : title;

  const content = (
    <div className={`flex items-center gap-2 ${containerClassName}`}>
      {workspaceAvatar}
      {((inSidebar && sidebarState === 'expanded') || !inSidebar) && (
        <span className={cn(titleClassName, 'truncate')}>{displayText}</span>
      )}
    </div>
  );

  if (!shouldShowTooltip) {
    return content;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          {title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
