import { ConnectionPermission, ConnectionProjectRef } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Globe } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { connectionAccessUiUtils } from '@/features/connections/utils/connection-access-utils';
import { cn } from '@/lib/utils';

function getPermissionLabel(permission: ConnectionPermission): string {
  switch (permission) {
    case ConnectionPermission.OWNER:
      return t('Owner');
    case ConnectionPermission.EDIT:
      return t('Can Edit');
    case ConnectionPermission.USE:
      return t('Can Use');
  }
}

export function ConnectionPermissionTag({
  permission,
}: {
  permission: ConnectionPermission;
}) {
  return (
    <Badge
      variant={
        permission === ConnectionPermission.OWNER ? 'default' : 'outline'
      }
    >
      {getPermissionLabel(permission)}
    </Badge>
  );
}

export function ConnectionScopeCell({
  allProjects,
  projects,
}: {
  allProjects: boolean;
  projects: ConnectionProjectRef[];
}) {
  const { first, remainder } = connectionAccessUiUtils.getScopeDisplay({
    allProjects,
    projects,
  });
  if (allProjects) {
    return (
      <Badge variant="info" className="gap-1">
        <Globe className="h-3 w-3" />
        {t('All Projects')}
      </Badge>
    );
  }
  if (!first) {
    return (
      <span className="text-muted-foreground text-sm">
        {t('No available projects')}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1 min-w-0">
      <Badge variant="outline" className="truncate">
        {first.displayName}
      </Badge>
      {remainder.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline">+{remainder.length}</Badge>
          </TooltipTrigger>
          <TooltipContent>
            {remainder.map((project) => project.displayName).join('、')}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function ConnectionStatusDot({
  tone,
}: {
  tone: 'success' | 'error' | 'default';
}) {
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', {
        'bg-success-600': tone === 'success',
        'bg-destructive-600': tone === 'error',
        'bg-muted-foreground': tone === 'default',
      })}
    />
  );
}
