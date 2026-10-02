import { SolutionSummary } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Download, Workflow } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

import { solutionsUtils } from '../utils/solutions-utils';

import { SolutionConnectorIcons } from './solution-connector-icons';

function SolutionCard({ solution, onClick }: SolutionCardProps) {
  return (
    <Card
      variant="interactive"
      className="gap-3 p-4 text-left"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onClick();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <SolutionConnectorIcons connectorNames={solution.connectorNames} />
        {solution.installedProjectIds.length > 0 && (
          <Badge variant="success">{t('Already installed')}</Badge>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="truncate font-medium">{solution.name}</div>
        <div className="line-clamp-2 text-sm text-muted-foreground">
          {solution.summary}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{solutionsUtils.providerLabel(solution.provider)}</span>
        <span>v{solution.currentVersion}</span>
        <span className="flex items-center gap-1">
          <Workflow className="size-3" />
          {t('{count, plural, =1 {1 workflow} other {# workflows}}', {
            count: solution.workflowCount,
          })}
        </span>
        <span className="flex items-center gap-1">
          <Download className="size-3" />
          {t('{count, plural, =1 {1 install} other {# installs}}', {
            count: solution.installCount,
          })}
        </span>
      </div>
    </Card>
  );
}

export { SolutionCard };

type SolutionCardProps = {
  solution: SolutionSummary;
  onClick: () => void;
};
