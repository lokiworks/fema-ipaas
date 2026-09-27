import { isNil } from '@fema-ipaas/core-utils';
import { Permission } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  BlocksIcon,
  CircleAlertIcon,
  HistoryIcon,
  LucideIcon,
  GitBranchIcon,
  SearchIcon,
} from 'lucide-react';

import { LeftSideBarType } from '@/app/builder/types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { cn } from '@/lib/utils';

export function ToolRail({ active, onSelect, badges }: ToolRailProps) {
  const { checkAccess } = useAuthorization();
  const visibleTools = TOOLS.filter(
    (tool) => isNil(tool.permission) || checkAccess(tool.permission),
  );

  return (
    <div
      data-tour="builder-tool-rail"
      className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-r bg-background py-2"
    >
      {visibleTools.map((tool) => {
        const isActive = active === tool.type;
        return (
          <Tooltip key={tool.type} delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={tool.label()}
                aria-pressed={isActive}
                onClick={() =>
                  onSelect(isActive ? LeftSideBarType.NONE : tool.type)
                }
                className={cn(
                  'relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
                  'hover:bg-muted hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive && 'bg-primary/10 text-primary hover:bg-primary/10',
                )}
              >
                <tool.icon className="size-4" />
                <ToolBadgeDot badge={badges?.[tool.type]} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{tool.label()}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function ToolBadgeDot({ badge }: { badge: ToolBadge | undefined }) {
  if (isNil(badge) || badge.count <= 0) {
    return null;
  }
  return (
    <span
      className={cn(
        'absolute right-0 top-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-medium leading-none',
        badge.tone === 'error'
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-warning text-warning-foreground',
      )}
    >
      {badge.count > 99 ? '99+' : badge.count}
    </span>
  );
}

const TOOLS: {
  type: LeftSideBarType;
  icon: LucideIcon;
  label: () => string;
  permission?: Permission;
}[] = [
  {
    type: LeftSideBarType.CONNECTOR_PICKER,
    icon: BlocksIcon,
    label: () => t('Connectors'),
  },
  {
    type: LeftSideBarType.RUNS,
    icon: HistoryIcon,
    label: () => t('Debug records'),
    permission: Permission.READ_WORKFLOW,
  },
  {
    type: LeftSideBarType.VERSIONS,
    icon: GitBranchIcon,
    label: () => t('Versions'),
  },
  {
    type: LeftSideBarType.VALIDATION,
    icon: CircleAlertIcon,
    label: () => t('Validation'),
  },
  {
    type: LeftSideBarType.SEARCH,
    icon: SearchIcon,
    label: () => t('Search steps'),
  },
];

export type ToolRailProps = {
  active: LeftSideBarType;
  onSelect: (type: LeftSideBarType) => void;
  badges?: Partial<Record<LeftSideBarType, ToolBadge>>;
};

export type ToolBadge = {
  count: number;
  tone: 'error' | 'warning';
};
