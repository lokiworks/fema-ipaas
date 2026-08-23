import {
  WORKSPACE_COLOR_PALETTE,
  WorkspaceType,
  WorkspaceWithLimits,
} from '@fema-ipaas/shared';

import { cn } from '@/lib/utils';

export function WorkspaceAvatar({
  workspace,
  size = 'md',
}: WorkspaceAvatarProps) {
  const isPersonal = workspace.type === WorkspaceType.PERSONAL;
  const palette = WORKSPACE_COLOR_PALETTE[workspace.icon.color];
  const background = isPersonal ? '#9ca3af' : palette.color;
  const color = isPersonal ? '#ffffff' : palette.textColor;

  const sizeClass = size === 'sm' ? 'size-5 text-[10px]' : 'size-7 text-xs';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md font-semibold',
        sizeClass,
      )}
      style={{ backgroundColor: background, color }}
    >
      {workspace.displayName.charAt(0).toUpperCase()}
    </div>
  );
}

type WorkspaceAvatarProps = {
  workspace: WorkspaceWithLimits;
  size?: 'sm' | 'md';
};
