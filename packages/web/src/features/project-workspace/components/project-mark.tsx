import { PROJECT_COLOR_PALETTE, ProjectIcon } from '@fema-ipaas/shared';

import { cn } from '@/lib/utils';

export function ProjectMark({
  name,
  icon,
  className,
}: {
  name: string;
  icon: ProjectIcon;
  className?: string;
}) {
  const palette = PROJECT_COLOR_PALETTE[icon.color];
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: palette.color, color: palette.textColor }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
