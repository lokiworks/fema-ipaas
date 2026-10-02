import {
  SolutionCheck,
  SolutionConfigItem,
  SolutionDetail,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ChevronLeft, Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { FormattedDate } from '@/components/custom/formatted-date';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ConnectorDisplayName } from '@/features/connectors';
import { authenticationSession } from '@/lib/authentication-session';

import { solutionsUtils } from '../utils/solutions-utils';

import { PublishVersionDialog } from './publish-version-dialog';
import { SolutionCheckLabel } from './solution-check-label';
import { SolutionConnectorIcons } from './solution-connector-icons';

function SolutionDetailView({ solution }: SolutionDetailViewProps) {
  const navigate = useNavigate();
  const [publishing, setPublishing] = useState(false);
  const pkg = solution.package;
  const canPublish =
    solutionsUtils.isOwn({
      solution,
      userId: authenticationSession.getCurrentUserId(),
    }) && solution.sourceProjectId !== null;

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-6 py-6">
      <Link
        to="/solutions"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t('Solutions')}
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <SolutionConnectorIcons
          connectorNames={solution.connectorNames}
          size="lg"
        />
        <div className="flex min-w-0 grow flex-col gap-1">
          <h1 className="truncate text-xl font-medium">{solution.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{solutionsUtils.providerLabel(solution.provider)}</span>
            <span>v{solution.currentVersion}</span>
            <Badge variant="outline">{solution.category}</Badge>
            <span>
              {t('Updated')} <FormattedDate date={new Date(solution.updated)} />
            </span>
            <span>
              {t('{count, plural, =1 {1 install} other {# installs}}', {
                count: solution.installCount,
              })}
            </span>
          </div>
        </div>
        {canPublish && (
          <Button variant="outline" onClick={() => setPublishing(true)}>
            <Upload className="size-4" />
            {t('Publish new version')}
          </Button>
        )}
        <Button onClick={() => navigate(`/solutions/${solution.id}/install`)}>
          <Download className="size-4" />
          {t('Install')}
        </Button>
      </div>

      {solution.installedProjectIds.length > 0 && (
        <Alert variant="success">
          <AlertDescription>
            {t(
              'Installed in {count, plural, =1 {1 project} other {# projects}}.',
              { count: solution.installedProjectIds.length },
            )}{' '}
            <Link className="underline" to="/solutions?tab=installed">
              {t('See installed solutions')}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('About this solution')}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">{solution.summary}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('Included resources')}</CardTitle>
              <CardDescription>
                {t(
                  'They are created in the project you pick. Workflows stay disabled until you test and enable them.',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {pkg.workflows.map((workflow) => (
                <ResourceRow
                  key={workflow.key}
                  title={workflow.name}
                  description={workflow.description}
                  badge={t('Workflow')}
                />
              ))}
              {pkg.mappingTables.map((table) => (
                <ResourceRow
                  key={table.key}
                  title={table.name}
                  description={table.description}
                  badge={t('Mapping table')}
                />
              ))}
            </CardContent>
          </Card>

          {pkg.checks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('Before you install')}</CardTitle>
                <CardDescription>
                  {t(
                    'The wizard checks these one by one. A required check has to pass before installing.',
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {pkg.checks.map((check) => (
                  <CheckRow key={check.key} check={check} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('Connections needed')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {pkg.connections.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t('No connections needed')}
                </p>
              )}
              {pkg.connections.map((slot) => (
                <div key={slot.connectorName} className="flex flex-col gap-1">
                  <div className="text-sm font-medium">
                    <ConnectorDisplayName connectorName={slot.connectorName} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('Used by: {names}', {
                      names: solutionsUtils
                        .workflowNamesOf({ slot, pkg })
                        .join(', '),
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {pkg.config.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('Configuration')}</CardTitle>
                <CardDescription>
                  {t('You fill these in while installing')}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {pkg.config.map((item) => (
                  <ConfigRow key={item.key} item={item} />
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('Version history')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {solution.versions.map((version) => (
                <div key={version.version} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">v{version.version}</span>
                    <FormattedDate
                      className="text-xs text-muted-foreground"
                      date={new Date(version.publishedAt)}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {solutionsUtils.versionNotesLabel(version.notes)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {canPublish && (
        <PublishVersionDialog
          solution={solution}
          open={publishing}
          onOpenChange={setPublishing}
        />
      )}
    </div>
  );
}

function ResourceRow({ title, description, badge }: ResourceRowProps) {
  return (
    <div className="flex items-start gap-3">
      <Badge variant="secondary">{badge}</Badge>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{title}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: SolutionCheck }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">
          <SolutionCheckLabel label={check.label} />
        </span>
        {check.detail && (
          <span className="text-xs text-muted-foreground">{check.detail}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {check.who && <Badge variant="outline">{check.who}</Badge>}
        <Badge variant={check.blocking ? 'destructive' : 'secondary'}>
          {check.blocking ? t('Required') : t('Recommended')}
        </Badge>
      </div>
    </div>
  );
}

function ConfigRow({ item }: { item: SolutionConfigItem }) {
  const defaultOption = item.options.find(
    (option) => option.value === item.defaultValue,
  );
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-medium">{item.label}</span>
      {item.defaultValue.length > 0 && (
        <span className="text-xs text-muted-foreground">
          {t('Default: {value}', {
            value: defaultOption?.label ?? item.defaultValue,
          })}
        </span>
      )}
    </div>
  );
}

export { SolutionDetailView };

type SolutionDetailViewProps = {
  solution: SolutionDetail;
};

type ResourceRowProps = {
  title: string;
  description?: string;
  badge: string;
};
