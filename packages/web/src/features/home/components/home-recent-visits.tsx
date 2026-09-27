import { ProjectDirectoryItem } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Clock, Database, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatUtils } from '@/lib/format-utils';
import { RecentVisit } from '@/lib/recent-visits';

import { homeUtils } from '../utils/home-utils';

import { HomeSection } from './home-section';

export function HomeRecentVisits({
  visits,
  projects,
}: {
  visits: RecentVisit[];
  projects: ProjectDirectoryItem[];
}) {
  return (
    <HomeSection
      title={t('Recently visited')}
      description={t('Workflows and data stores you opened recently')}
      tourTarget="home-recent"
    >
      {visits.length === 0 ? (
        <Card className="flex items-center gap-3 p-4">
          <Clock className="size-5 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {t('Nothing opened recently')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('Workflows and data stores you open will show up here.')}
            </span>
          </div>
        </Card>
      ) : (
        <Card className="divide-y p-0">
          {visits.map((visit) => {
            const project = projects.find(
              (item) => item.id === visit.projectId,
            );
            const Icon = visit.type === 'dataStore' ? Database : Workflow;
            return (
              <Link
                key={`${visit.type}-${visit.id}`}
                to={homeUtils.recentVisitHref(visit)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <TextWithTooltip tooltipMessage={visit.name}>
                    <div className="truncate text-sm font-medium">
                      {visit.name}
                    </div>
                  </TextWithTooltip>
                  <Badge variant="outline" className="shrink-0">
                    {visit.type === 'dataStore'
                      ? t('Data store')
                      : t('Workflow')}
                  </Badge>
                </div>
                <span className="hidden w-40 truncate text-xs text-muted-foreground sm:block">
                  {project?.displayName ?? ''}
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                  {formatUtils.formatDate(new Date(visit.visitedAt))}
                </span>
              </Link>
            );
          })}
        </Card>
      )}
    </HomeSection>
  );
}
