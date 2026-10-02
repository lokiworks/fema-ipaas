import {
  SolutionConfigItem,
  SolutionDetail,
  SolutionInstallResult,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getProjectName, projectCollectionUtils } from '@/features/projects';
import { solutionsHooks, solutionsUtils } from '@/features/solutions';

import { WizardFooter } from './wizard-parts';
import { WizardDraft } from './wizard-types';

function ConfirmStep({
  solution,
  draft,
  onBack,
  onInstalled,
}: ConfirmStepProps) {
  const { data: projects } = projectCollectionUtils.useAll();
  const project = projects.find((item) => item.id === draft.projectId);
  const request = {
    projectId: draft.projectId,
    connections: draft.connections,
    config: draft.config,
  };
  const {
    data: preview,
    isLoading,
    isError,
  } = solutionsHooks.useInstallPreview({ id: solution.id, request });
  const { mutate: install, isPending } = solutionsHooks.useInstall();
  const capacityError = preview?.capacityError ?? null;
  const items = solution.package.config;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SummaryBlock title={t('Project')}>
        <span className="text-sm">
          {project ? getProjectName(project) : ''}
        </span>
      </SummaryBlock>

      <SummaryBlock title={t('Will be created')}>
        {isLoading && <Skeleton className="h-16 w-full" />}
        {isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {t('Could not prepare the installation preview.')}
            </AlertDescription>
          </Alert>
        )}
        {preview && (
          <div className="flex flex-col gap-2">
            {preview.workflows.map((workflow) => (
              <div
                key={workflow.key}
                className="flex items-center gap-2 text-sm"
              >
                <Badge variant="secondary">{t('Workflow')}</Badge>
                {workflow.name}
              </div>
            ))}
            {preview.mappingTables.map((table) => (
              <div key={table.key} className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{t('Mapping table')}</Badge>
                {table.name}
                <span className="text-xs text-muted-foreground">
                  {table.reusedTableId
                    ? t('Reuses the existing table')
                    : t('New, empty table')}
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {t('Workflows are created disabled. Test them before enabling.')}
            </p>
          </div>
        )}
        {preview && capacityError && (
          <Alert variant="destructive">
            <AlertDescription>
              {solutionsUtils.capacityMessage({
                workflowLimit: preview.workflowLimit,
                currentWorkflowCount: preview.currentWorkflowCount,
                needed: preview.workflows.length,
              })}
            </AlertDescription>
          </Alert>
        )}
      </SummaryBlock>

      {items.length > 0 && (
        <SummaryBlock title={t('Configuration')}>
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <div key={item.key} className="flex gap-2 text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span>
                  {configValueLabel({ item, value: draft.config[item.key] })}
                </span>
              </div>
            ))}
          </div>
        </SummaryBlock>
      )}

      {draft.acknowledged.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {t(
              '{count, plural, =1 {1 recommended check is} other {# recommended checks are}} not confirmed. Related runs may fail until it is handled.',
              { count: draft.acknowledged.length },
            )}
          </AlertDescription>
        </Alert>
      )}

      <WizardFooter
        onBack={onBack}
        nextLabel={t('Install')}
        nextLoading={isPending}
        nextDisabled={isLoading || isError || capacityError !== null}
        onNext={() =>
          install(
            {
              id: solution.id,
              request: { ...request, acknowledgedChecks: draft.acknowledged },
            },
            { onSuccess: onInstalled },
          )
        }
      />
    </div>
  );
}

function SummaryBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}

function configValueLabel({
  item,
  value,
}: {
  item: SolutionConfigItem;
  value: string | undefined;
}): string {
  return (
    item.options.find((option) => option.value === value)?.label ?? value ?? ''
  );
}

export { ConfirmStep };

type ConfirmStepProps = {
  solution: SolutionDetail;
  draft: WizardDraft;
  onBack: () => void;
  onInstalled: (result: SolutionInstallResult) => void;
};
