import { SolutionInstallResult } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleCheck } from 'lucide-react';
import { Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SolutionCheckLabel, solutionsUtils } from '@/features/solutions';

function DoneStep({ result }: DoneStepProps) {
  const navigate = useNavigate();
  const { projectId } = result.install;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <CircleCheck className="size-6 shrink-0 text-success" />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">{t('Installation complete')}</h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'Workflows are disabled. Open each one, test it, then enable it.',
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {result.workflows.map((workflow) => (
          <div
            key={workflow.key}
            className="flex items-center gap-3 rounded-lg border p-3"
          >
            <Badge variant="secondary">{t('Workflow')}</Badge>
            <span className="grow truncate text-sm font-medium">
              {workflow.displayName}
            </span>
            <Button asChild size="sm">
              <Link
                to={solutionsUtils.workflowPath({
                  projectId,
                  workflowId: workflow.workflowId,
                })}
              >
                {t('Open workflow')}
              </Link>
            </Button>
          </div>
        ))}
        {result.mappingTables.map((table) => (
          <div
            key={table.key}
            className="flex items-center gap-3 rounded-lg border p-3"
          >
            <Badge variant="secondary">{t('Mapping table')}</Badge>
            <span className="grow truncate text-sm font-medium">
              {table.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {table.reused ? t('Reused') : t('New')}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link
                to={`/projects/${projectId}/mapping-tables?id=${table.tableId}`}
              >
                {t('Open mapping table')}
              </Link>
            </Button>
          </div>
        ))}
      </div>

      {result.skippedChecks.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {t('Checks skipped during install:')}{' '}
            {result.skippedChecks.map((label, index) => (
              <Fragment key={label}>
                {index > 0 && ', '}
                <SolutionCheckLabel label={label} />
              </Fragment>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => navigate('/solutions?tab=installed')}
        >
          {t('See installed solutions')}
        </Button>
      </div>
    </div>
  );
}

export { DoneStep };

type DoneStepProps = {
  result: SolutionInstallResult;
};
