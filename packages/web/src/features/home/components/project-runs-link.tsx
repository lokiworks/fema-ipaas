import { t } from 'i18next';
import { ChevronRight } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

import { homeUtils } from '../utils/home-utils';

export function ProjectRunsLink({
  targets,
  fallbackProjectId,
  since,
  failedOnly,
  className,
  title,
  children,
}: {
  targets: ProjectRunsTarget[];
  fallbackProjectId: string | null;
  since: string;
  failedOnly: boolean;
  className: string;
  title: string;
  children: React.ReactNode;
}) {
  const single = targets.length === 1 ? targets[0].projectId : null;
  const direct = targets.length === 0 ? fallbackProjectId : single;
  if (targets.length <= 1) {
    if (direct === null) {
      return <div className={className}>{children}</div>;
    }
    return (
      <Link
        to={homeUtils.runsHref({ projectId: direct, since, failedOnly })}
        className={className}
        title={title}
      >
        {children}
      </Link>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={className} title={title}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {t('Runs are listed per project. Choose a project')}
        </div>
        {targets.map((target) => (
          <Link
            key={target.projectId}
            to={homeUtils.runsHref({
              projectId: target.projectId,
              since,
              failedOnly,
            })}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
          >
            <span className="min-w-0 flex-1 truncate">{target.name}</span>
            <span className="text-xs text-muted-foreground">
              {target.count}
            </span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export type ProjectRunsTarget = {
  projectId: string;
  name: string;
  count: number;
};
