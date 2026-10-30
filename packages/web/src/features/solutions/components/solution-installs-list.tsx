import {
  SolutionInstall,
  SolutionInstallResource,
  SolutionInstallResourceKind,
  SolutionInstallResourceStatus,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Package } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getProjectName, projectCollectionUtils } from '@/features/projects';

import { solutionsHooks } from '../hooks/solutions-hooks';
import { solutionsUtils } from '../utils/solutions-utils';

import { UpgradeInstallDialog } from './upgrade-install-dialog';

function SolutionInstallsList({ onBrowse }: SolutionInstallsListProps) {
  const { data: installs, isLoading } = solutionsHooks.useInstalls();
  const { data: projects } = projectCollectionUtils.useAll();
  const [upgrading, setUpgrading] = useState<SolutionInstall | null>(null);
  const [viewing, setViewing] = useState<SolutionInstall | null>(null);
  const [removing, setRemoving] = useState<SolutionInstall | null>(null);

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if ((installs ?? []).length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Package />
          </EmptyMedia>
          <EmptyTitle>{t('No solutions installed')}</EmptyTitle>
          <EmptyDescription>
            {t('Installed solutions show up here, grouped by project.')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onBrowse}>{t('Browse solutions')}</Button>
        </EmptyContent>
      </Empty>
    );
  }

  const groups = groupByProject(installs ?? []);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const project = projects.find((item) => item.id === group.projectId);
        return (
          <section key={group.projectId} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">
              {project ? getProjectName(project) : t('Unknown project')}
            </h2>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Solution')}</TableHead>
                    <TableHead>{t('Version')}</TableHead>
                    <TableHead>{t('Resources')}</TableHead>
                    <TableHead>{t('Workflows')}</TableHead>
                    <TableHead>{t('Installed')}</TableHead>
                    <TableHead className="text-right">{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.installs.map((install) => {
                    const allDeleted =
                      install.resourceStatus ===
                      SolutionInstallResourceStatus.ALL_DELETED;
                    return (
                      <TableRow
                        key={install.id}
                        className="cursor-pointer"
                        onClick={() => setViewing(install)}
                      >
                        <TableCell>
                          <Link
                            className="font-medium hover:underline"
                            to={`/solutions/${install.solutionId}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {install.solutionName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>v{install.version}</span>
                            {!allDeleted &&
                              solutionsUtils.hasNewerVersion(install) && (
                                <Badge variant="info">
                                  {t('Update to v{version}', {
                                    version: install.latestVersion,
                                  })}
                                </Badge>
                              )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ResourceStatusBadge status={install.resourceStatus} />
                        </TableCell>
                        <TableCell>
                          {t('{existing} of {total}', {
                            existing: existingCount({
                              install,
                              kind: SolutionInstallResourceKind.WORKFLOW,
                            }),
                            total: install.workflowIds.length,
                          })}
                        </TableCell>
                        <TableCell>
                          <FormattedDate date={new Date(install.created)} />
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewing(install)}
                            >
                              {t('View resources')}
                            </Button>
                            {!allDeleted &&
                              solutionsUtils.hasNewerVersion(install) && (
                                <Button
                                  size="sm"
                                  onClick={() => setUpgrading(install)}
                                >
                                  {t('Upgrade')}
                                </Button>
                              )}
                            {allDeleted && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setRemoving(install)}
                              >
                                {t('Remove record')}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}
      {upgrading && (
        <UpgradeInstallDialog
          key={upgrading.id}
          install={upgrading}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setUpgrading(null);
            }
          }}
        />
      )}
      <InstallResourcesDialog
        install={viewing}
        onOpenChange={(open) => {
          if (!open) {
            setViewing(null);
          }
        }}
        onRemove={(install) => {
          setViewing(null);
          setRemoving(install);
        }}
      />
      <RemoveRecordDialog
        install={removing}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
          }
        }}
      />
    </div>
  );
}

function ResourceStatusBadge({
  status,
}: {
  status: SolutionInstallResourceStatus;
}) {
  switch (status) {
    case SolutionInstallResourceStatus.INTACT:
      return <Badge variant="success">{t('Resources intact')}</Badge>;
    case SolutionInstallResourceStatus.PARTIALLY_DELETED:
      return (
        <Badge variant="outline" className="border-warning-600 text-warning-700">
          {t('Partly deleted')}
        </Badge>
      );
    case SolutionInstallResourceStatus.ALL_DELETED:
      return <Badge variant="outline">{t('All deleted')}</Badge>;
  }
}

function InstallResourcesDialog({
  install,
  onOpenChange,
  onRemove,
}: {
  install: SolutionInstall | null;
  onOpenChange: (open: boolean) => void;
  onRemove: (install: SolutionInstall) => void;
}) {
  return (
    <Dialog open={install !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {install && (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('Resources of {name}', { name: install.solutionName })}
              </DialogTitle>
              <DialogDescription>
                {install.resourceStatus ===
                SolutionInstallResourceStatus.ALL_DELETED
                  ? t(
                      'Every resource this install created has been deleted, so it no longer counts as installed. You can remove the record.',
                    )
                  : t(
                      'Workflows and mapping tables this install created. Deleted ones are kept here for reference.',
                    )}
              </DialogDescription>
            </DialogHeader>
            <ul className="flex flex-col divide-y rounded-md border text-sm">
              {install.resources.map((resource) => (
                <ResourceRow
                  key={`${resource.kind}:${resource.id}`}
                  projectId={install.projectId}
                  resource={resource}
                />
              ))}
              {install.resources.length === 0 && (
                <li className="px-3 py-2 text-muted-foreground">
                  {t('This install created no resources.')}
                </li>
              )}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('Close')}
              </Button>
              {install.resourceStatus ===
                SolutionInstallResourceStatus.ALL_DELETED && (
                <Button variant="outline" onClick={() => onRemove(install)}>
                  {t('Remove record')}
                </Button>
              )}
              <Button asChild>
                <Link to={`/solutions/${install.solutionId}`}>
                  {t('Open solution')}
                </Link>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResourceRow({
  projectId,
  resource,
}: {
  projectId: string;
  resource: SolutionInstallResource;
}) {
  const kindLabel =
    resource.kind === SolutionInstallResourceKind.WORKFLOW
      ? t('Workflow')
      : t('Mapping table');
  const name =
    resource.name ??
    (resource.kind === SolutionInstallResourceKind.WORKFLOW
      ? t('Deleted workflow')
      : t('Deleted mapping table'));
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <Badge variant="outline" className="shrink-0">
          {kindLabel}
        </Badge>
        {resource.exists ? (
          <Link
            className="truncate text-primary hover:underline"
            to={resourcePath({ projectId, resource })}
          >
            {name}
          </Link>
        ) : (
          <span className="truncate text-muted-foreground line-through">
            {name}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {resource.exists ? t('Exists') : t('Deleted')}
      </span>
    </li>
  );
}

function RemoveRecordDialog({
  install,
  onOpenChange,
}: {
  install: SolutionInstall | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate: remove, isPending } =
    solutionsHooks.useRemoveInstallRecord();
  return (
    <Dialog open={install !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Remove the install record?')}</DialogTitle>
          <DialogDescription>
            {t(
              'Only the record is removed; the workflows and mapping tables are already gone. The removal is written to the audit log.',
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            loading={isPending}
            disabled={install === null}
            onClick={() =>
              install &&
              remove(install.id, { onSuccess: () => onOpenChange(false) })
            }
          >
            {t('Remove record')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function resourcePath({
  projectId,
  resource,
}: {
  projectId: string;
  resource: SolutionInstallResource;
}): string {
  return resource.kind === SolutionInstallResourceKind.WORKFLOW
    ? solutionsUtils.workflowPath({ projectId, workflowId: resource.id })
    : `/projects/${projectId}/mapping-tables?id=${resource.id}`;
}

function existingCount({
  install,
  kind,
}: {
  install: SolutionInstall;
  kind: SolutionInstallResourceKind;
}): number {
  return install.resources.filter(
    (resource) => resource.kind === kind && resource.exists,
  ).length;
}

function groupByProject(installs: SolutionInstall[]): InstallGroup[] {
  const projectIds = [...new Set(installs.map((install) => install.projectId))];
  return projectIds.map((projectId) => ({
    projectId,
    installs: installs.filter((install) => install.projectId === projectId),
  }));
}

export { SolutionInstallsList };

type SolutionInstallsListProps = {
  onBrowse: () => void;
};

type InstallGroup = {
  projectId: string;
  installs: SolutionInstall[];
};
