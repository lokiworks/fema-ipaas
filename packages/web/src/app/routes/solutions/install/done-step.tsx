import { SolutionInstallResult, SolutionPackage } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SolutionCheckLabel, solutionsUtils } from '@/features/solutions';

function DoneStep({ result, pkg }: DoneStepProps) {
  const navigate = useNavigate();
  const { projectId } = result.install;
  const { afterInstall } = solutionsUtils.splitChecks(pkg.checks);

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

      {afterInstall.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-lg border p-4"
          data-testid="solution-done-after-install"
        >
          <span className="text-sm font-medium">{t('After you install')}</span>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            {afterInstall.map((check) => (
              <li key={check.key}>
                <SolutionCheckLabel label={check.label} />
                {check.detail && (
                  <span className="block text-xs text-muted-foreground">
                    {check.detail}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {result.skippedChecks.length > 0 && (
        <Alert variant="warning">
          <AlertDescription className="flex flex-col gap-1">
            <span>{t('Checks skipped during install:')}</span>
            <ul className="flex list-disc flex-col gap-0.5 pl-5">
              {result.skippedChecks.map((label) => (
                <li key={label}>
                  <SolutionCheckLabel label={label} />
                </li>
              ))}
            </ul>
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
  pkg: SolutionPackage;
};
