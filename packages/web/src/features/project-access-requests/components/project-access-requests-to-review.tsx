import { t } from 'i18next';
import { Link } from 'react-router-dom';

import { FormattedDate } from '@/components/custom/formatted-date';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { projectAccessRequestsHooks } from '../hooks/project-access-requests-hooks';
import { projectAccessRequestUtils } from '../utils/project-access-request-utils';

export function ProjectAccessRequestsToReview() {
  const { data: requests, isLoading } =
    projectAccessRequestsHooks.useRequestsToReview();
  return (
    <Card data-testid="project-access-requests-to-review">
      <CardHeader>
        <CardTitle className="text-base">
          {t('projectJoinRequestsTitle', { count: requests?.length ?? 0 })}
        </CardTitle>
        <CardDescription>{t('projectJoinRequestsDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (requests ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('projectJoinRequestsEmpty')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {(requests ?? []).map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div className="flex min-w-0 flex-col">
                  <TextWithTooltip
                    tooltipMessage={`${projectAccessRequestUtils.requesterName(
                      request,
                    )} → ${request.projectDisplayName}`}
                  >
                    <span className="truncate font-medium">
                      {t('projectJoinRequestLine', {
                        user: projectAccessRequestUtils.requesterName(request),
                        project: request.projectDisplayName,
                      })}
                    </span>
                  </TextWithTooltip>
                  <span className="text-xs text-muted-foreground">
                    {projectAccessRequestUtils.reasonText(request.reason)}
                    {' · '}
                    <FormattedDate date={new Date(request.created)} />
                  </span>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link
                    to={projectAccessRequestUtils.membersLink(
                      request.projectId,
                    )}
                  >
                    {t('Review')}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
