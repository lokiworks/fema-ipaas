import { isNil } from '@fema-ipaas/core-utils';
import { Permission } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  BlocksIcon,
  CircleAlertIcon,
  HistoryIcon,
  LucideIcon,
  GitBranchIcon,
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
    <div className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-r bg-background py-2">
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
                {(badges?.[tool.type] ?? 0) > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-warning text-[9px] font-medium leading-none text-warning-foreground">
                    {badges?.[tool.type]}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{tool.label()}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
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
    label: () => t('Run History'),
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
];

export type ToolRailProps = {
  active: LeftSideBarType;
  onSelect: (type: LeftSideBarType) => void;
  badges?: Partial<Record<LeftSideBarType, number>>;
};
