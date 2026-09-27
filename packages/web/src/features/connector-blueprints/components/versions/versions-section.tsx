import {
  BlueprintConnectorState,
  BlueprintVersionStatus,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { GitBranchIcon, StoreIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { FormattedDate } from '@/components/custom/formatted-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

import { BlueprintCanaryDialog } from './canary-dialog';
import { BlueprintVersionActions } from './version-actions';
import { BlueprintVersionDrawer } from './version-drawer';
import { blueprintVersionStatusUtils } from './version-status-utils';

export function BlueprintVersionsSection({
  detail,
}: {
  detail: ConnectorBlueprintDetail;
}) {
  const navigate = useNavigate();
  const [detailVersionId, setDetailVersionId] = useState<string | null>(null);
  const [canaryVersionId, setCanaryVersionId] = useState<string | null>(null);
  const { data: projects } = connectorBlueprintHooks.useBlueprintProjects(
    detail.id,
  );
  const projectName = (projectId: string) =>
    (projects ?? []).find((project) => project.id === projectId)?.name ??
    t('Deleted project');

  const detailVersion =
    detail.versions.find((version) => version.id === detailVersionId) ?? null;
  const canaryVersion =
    detail.versions.find((version) => version.id === canaryVersionId) ?? null;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {t('Versions and publishing')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'Once published, nodes in workflows can switch to the new version. Versions with support stopped prompt an upgrade in the node panel',
            )}
          </p>
        </div>
        <Button
          onClick={() =>
            navigate(`/tenant/connectors/development/${detail.id}/publish`)
          }
        >
          <GitBranchIcon className="mr-1 size-4" />
          {detail.changes.length > 0
            ? t('Publish ({count} changes)', { count: detail.changes.length })
            : t('Publish')}
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <SummaryStat
          label={t('Current version')}
          value={
            detail.currentVersion
              ? `v${detail.currentVersion}`
              : t('Unpublished')
          }
        />
        <SummaryStat
          label={t('Status')}
          value={<ConnectorStateBadge detail={detail} />}
        />
        <SummaryStat
          label={t('Pending changes')}
          value={t('{count} items', { count: detail.changes.length })}
        />
        <SummaryStat
          label={t('In use')}
          value={t('{count} workflows', { count: detail.usage.workflows })}
        />
      </div>

      {detail.versions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitBranchIcon />
            </EmptyMedia>
            <EmptyTitle>{t('No version has been published yet')}</EmptyTitle>
            <EmptyDescription>
              {t(
                'Fill in basic information, authentication and at least one operation, then publish',
              )}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() =>
                navigate(`/tenant/connectors/development/${detail.id}/publish`)
              }
            >
              {t('Publish')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Version')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Release notes')}</TableHead>
              <TableHead>{t('Published on')}</TableHead>
              <TableHead>{t('Published by')}</TableHead>
              <TableHead>{t('In use')}</TableHead>
              <TableHead>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.versions.map((version, index) => (
              <TableRow
                key={version.id}
                className="cursor-pointer"
                onClick={() => setDetailVersionId(version.id)}
              >
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{version.version}</span>
                    {index === 0 && (
                      <Badge variant="outline">{t('Latest')}</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {version.packageVersion}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge
                      variant={blueprintVersionStatusUtils.badgeVariant(
                        version.status,
                      )}
                    >
                      {blueprintVersionStatusUtils.label(version.status)}
                    </Badge>
                    {version.status === BlueprintVersionStatus.CANARY && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="truncate">
                          {t('Canary: {projects}', {
                            projects:
                              version.canaryProjectIds.length > 0
                                ? version.canaryProjectIds
                                    .map(projectName)
                                    .join('、')
                                : t('Not set'),
                          })}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-primary underline-offset-4 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setCanaryVersionId(version.id);
                          }}
                        >
                          {t('Adjust')}
                        </button>
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-xs">
                  <p className="truncate">{version.description || '-'}</p>
                  {version.updates.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t('Updated within this version {count} times', {
                        count: version.updates.length,
                      })}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <FormattedDate
                    date={new Date(version.publishedAt)}
                    includeTime
                  />
                </TableCell>
                <TableCell className="text-sm">
                  {version.publishedBy?.name ?? t('Deleted user')}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {t('{count} nodes', { count: version.usage })}
                </TableCell>
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <BlueprintVersionActions detail={detail} version={version} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <MarketplaceCard detail={detail} />

      <BlueprintVersionDrawer
        detail={detail}
        version={detailVersion}
        onClose={() => setDetailVersionId(null)}
      />
      <BlueprintCanaryDialog
        open={canaryVersion !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCanaryVersionId(null);
          }
        }}
        blueprintId={detail.id}
        version={canaryVersion}
      />
    </div>
  );
}

function SummaryStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function ConnectorStateBadge({ detail }: { detail: ConnectorBlueprintDetail }) {
  switch (detail.state) {
    case BlueprintConnectorState.PUBLISHED:
      return (
        <Badge variant="success">
          {t('Published v{version}', {
            version: detail.currentVersion ?? '',
          })}
        </Badge>
      );
    case BlueprintConnectorState.OFFLINE:
      return <Badge variant="secondary">{t('Offline')}</Badge>;
    case BlueprintConnectorState.DRAFT:
      return <Badge variant="outline">{t('Draft')}</Badge>;
  }
}

function MarketplaceCard({ detail }: { detail: ConnectorBlueprintDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <StoreIcon className="size-4 text-muted-foreground" />
          {t('Tenant connector marketplace')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t(
            'Custom connectors are only visible inside this tenant. They are never published to an external connector registry',
          )}
        </p>
        {marketplaceStatus(detail)}
      </CardContent>
    </Card>
  );
}

function marketplaceStatus(detail: ConnectorBlueprintDetail): React.ReactNode {
  switch (detail.state) {
    case BlueprintConnectorState.PUBLISHED:
      return (
        <div className="flex items-center gap-2">
          <Badge variant="success">{t('Listed')}</Badge>
          <span className="text-sm text-muted-foreground">
            {t('This connector shows up in the tenant connector marketplace')}
          </span>
        </div>
      );
    case BlueprintConnectorState.OFFLINE:
      return (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t('Offline')}</Badge>
          <span className="text-sm text-muted-foreground">
            {t(
              'All versions have support stopped. Restoring one brings the connector back online',
            )}
          </span>
        </div>
      );
    case BlueprintConnectorState.DRAFT:
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline">{t('Draft')}</Badge>
          <span className="text-sm text-muted-foreground">
            {t(
              'Publish the first version to make this connector appear in the tenant connector marketplace',
            )}
          </span>
        </div>
      );
  }
}
