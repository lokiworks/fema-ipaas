import { isNil, Permission } from '@fema-ipaas/core-utils';
import {
  EnvironmentOverview,
  EnvironmentWorkflow,
  FlagId,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { CopyButton } from '@/components/custom/clipboard/copy-button';
import { FormattedDate } from '@/components/custom/formatted-date';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { projectCollectionUtils } from '@/features/projects';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { flagsHooks } from '@/hooks/flags-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { releasesHooks } from '../hooks/releases-hooks';
import { releaseUiUtils } from '../utils/release-ui-utils';

import { ApprovalSettingsCard } from './approval-settings-card';
import { ReleaseRequestDialog } from './release-request-dialog';
import { TurnOffEnvironmentsDialog } from './turn-off-environments-dialog';
import { TurnOnEnvironmentsDialog } from './turn-on-environments-dialog';

export function EnvironmentsSection({
  testConnections,
}: {
  testConnections: React.ReactNode;
}) {
  const { project } = projectCollectionUtils.useCurrentProject();
  const { checkAccess } = useAuthorization();
  const { data: overview, isLoading } = releasesHooks.useEnvironments({
    projectId: project.id,
    enabled: true,
    showErrorDialog: true,
  });
  const [turnOnOpen, setTurnOnOpen] = useState(false);
  const [turnOffOpen, setTurnOffOpen] = useState(false);
  return (
    <>
      <EnvironmentsContent
        overview={overview}
        isLoading={isLoading}
        canManage={checkAccess(Permission.WRITE_PROJECT)}
        onTurnOn={() => setTurnOnOpen(true)}
        onTurnOff={() => setTurnOffOpen(true)}
        testConnections={testConnections}
      />
      <TurnOnEnvironmentsDialog
        open={turnOnOpen}
        onOpenChange={setTurnOnOpen}
      />
      <TurnOffEnvironmentsDialog
        open={turnOffOpen}
        onOpenChange={setTurnOffOpen}
        projectId={project.id}
        approverIds={overview?.approverIds ?? []}
      />
    </>
  );
}

function EnvironmentsContent({
  overview,
  isLoading,
  canManage,
  onTurnOn,
  onTurnOff,
  testConnections,
}: {
  overview: EnvironmentOverview | undefined;
  isLoading: boolean;
  canManage: boolean;
  onTurnOn: () => void;
  onTurnOff: () => void;
  testConnections: React.ReactNode;
}) {
  const { project } = projectCollectionUtils.useCurrentProject();
  if (isLoading || isNil(overview)) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!overview.enabled) {
    return <SingleEnvironmentCard canManage={canManage} onTurnOn={onTurnOn} />;
  }
  return (
    <div className="flex flex-col gap-4">
      <EnvironmentsOnCard
        overview={overview}
        canManage={canManage}
        onTurnOff={onTurnOff}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatsCard
          title={t('Test environment')}
          description={t('Where changes run first, with test values')}
          stats={[
            { label: t('Deployed workflows'), value: overview.test.deployed },
            {
              label: t('Newer than production'),
              value: overview.test.newerThanProduction,
            },
            {
              label: t('Connection replacements'),
              value: overview.test.replacements,
            },
          ]}
        />
        <StatsCard
          title={t('Production environment')}
          description={t('What runs for real')}
          stats={[
            {
              label: t('Deployed workflows'),
              value: overview.production.deployed,
            },
            { label: t('Running'), value: overview.production.running },
            {
              label: t('Waiting for approval'),
              value: overview.production.pendingApproval,
            },
          ]}
        />
      </div>
      <WorkflowsCard workflows={overview.workflows} />
      <ApprovalSettingsCard
        projectId={project.id}
        approverIds={overview.approverIds}
        canManage={canManage}
      />
      {testConnections}
    </div>
  );
}

function SingleEnvironmentCard({
  canManage,
  onTurnOn,
}: {
  canManage: boolean;
  onTurnOn: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Single environment')}</CardTitle>
        <CardDescription>
          {t(
            'Publishing puts changes live immediately. Turn on test and production to try changes in test before they reach production.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canManage ? (
          <Button size="sm" onClick={onTurnOn}>
            {t('Turn on test and production')}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('A project admin can turn on test and production.')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EnvironmentsOnCard({
  overview,
  canManage,
  onTurnOff,
}: {
  overview: EnvironmentOverview;
  canManage: boolean;
  onTurnOff: () => void;
}) {
  const { project } = projectCollectionUtils.useCurrentProject();
  const isOwner = authenticationSession.getCurrentUserId() === project.ownerId;
  const disabledReason = !isOwner
    ? t('Only the project owner can turn this off')
    : overview.production.pendingApproval > 0
    ? t('pendingPromotionsBlockTurnOff', {
        count: overview.production.pendingApproval,
      })
    : null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{t('Test and production are on')}</CardTitle>
          <CardDescription>
            {t(
              'Publishing in the editor deploys to test. Production changes only when a workflow is promoted.',
            )}
          </CardDescription>
        </div>
        {canManage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="tooltip-wrapper shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!isNil(disabledReason)}
                  onClick={onTurnOff}
                >
                  {t('Turn off')}
                </Button>
              </div>
            </TooltipTrigger>
            {!isNil(disabledReason) && (
              <TooltipContent>{disabledReason}</TooltipContent>
            )}
          </Tooltip>
        )}
      </CardHeader>
    </Card>
  );
}

function StatsCard({
  title,
  description,
  stats,
}: {
  title: string;
  description: string;
  stats: { label: string; value: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="text-2xl font-semibold">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function WorkflowsCard({ workflows }: { workflows: EnvironmentWorkflow[] }) {
  const { checkAccess } = useAuthorization();
  const canPromote = checkAccess(Permission.WRITE_PROJECT_RELEASE);
  const { data: webhookUrlPrefix } = flagsHooks.useFlag<string>(
    FlagId.WEBHOOK_URL_PREFIX,
  );
  const [promoteWorkflowId, setPromoteWorkflowId] = useState<string | null>(
    null,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Workflows')}</CardTitle>
        <CardDescription>
          {t(
            'A test webhook URL runs the version in test with test variable values and test connections. Add /sync to the URL to wait for the response.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {workflows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('No workflows in this project yet.')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Workflow')}</TableHead>
                <TableHead>{t('In test since')}</TableHead>
                <TableHead>{t('Production')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Test webhook URL')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map((row) => (
                <TableRow key={row.workflowId}>
                  <TableCell className="max-w-64">
                    <TextWithTooltip tooltipMessage={row.displayName}>
                      <p className="text-sm font-medium">{row.displayName}</p>
                    </TextWithTooltip>
                  </TableCell>
                  <TableCell>
                    {isNil(row.testDeployedAt) ? (
                      <span className="text-sm text-muted-foreground">
                        {t('Not deployed')}
                      </span>
                    ) : (
                      <FormattedDate
                        date={new Date(row.testDeployedAt)}
                        includeTime={true}
                        className="text-sm"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn('text-sm', {
                        'text-muted-foreground': isNil(row.productionVersionId),
                      })}
                    >
                      {productionLabel(row)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.testIsNewer && (
                        <Badge variant="info">{t('Test is newer')}</Badge>
                      )}
                      {!isNil(row.pendingReleaseId) && (
                        <Badge variant="outline" asChild>
                          <Link
                            to={authenticationSession.appendProjectRoutePrefix(
                              `/releases/${row.pendingReleaseId}`,
                            )}
                          >
                            {t('Pending approval')}
                          </Link>
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isNil(row.testVersionId) ? (
                      <span className="text-sm text-muted-foreground">
                        {t('Deploy to test first')}
                      </span>
                    ) : (
                      <CopyButton
                        variant="ghost"
                        aria-label={t('Copy test webhook URL')}
                        textToCopy={releaseUiUtils.testWebhookUrl({
                          webhookUrlPrefix,
                          workflowId: row.workflowId,
                        })}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canPromote &&
                      row.testIsNewer &&
                      isNil(row.pendingReleaseId) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPromoteWorkflowId(row.workflowId)}
                        >
                          {t('Promote')}
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <ReleaseRequestDialog
          open={!isNil(promoteWorkflowId)}
          onOpenChange={(open) => {
            if (!open) {
              setPromoteWorkflowId(null);
            }
          }}
          workflowId={promoteWorkflowId ?? ''}
        />
      </CardContent>
    </Card>
  );
}

function productionLabel(row: EnvironmentWorkflow): string {
  if (isNil(row.productionVersionId)) {
    return t('Not published');
  }
  return row.enabled ? t('Running') : t('Stopped');
}
