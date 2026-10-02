import { SolutionInstall } from '@fema-ipaas/shared';
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
                    <TableHead>{t('Workflows')}</TableHead>
                    <TableHead>{t('Installed')}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.installs.map((install) => (
                    <TableRow key={install.id}>
                      <TableCell>
                        <Link
                          className="font-medium hover:underline"
                          to={`/solutions/${install.solutionId}`}
                        >
                          {install.solutionName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>v{install.version}</span>
                          {solutionsUtils.hasNewerVersion(install) && (
                            <Badge variant="info">
                              {t('Update to v{version}', {
                                version: install.latestVersion,
                              })}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{install.workflowIds.length}</TableCell>
                      <TableCell>
                        <FormattedDate date={new Date(install.created)} />
                      </TableCell>
                      <TableCell className="text-right">
                        {solutionsUtils.hasNewerVersion(install) && (
                          <Button
                            size="sm"
                            onClick={() => setUpgrading(install)}
                          >
                            {t('Upgrade')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
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
    </div>
  );
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
