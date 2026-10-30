import { ProjectDirectoryItem } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ProjectSettingsDialog } from '@/app/components/project-settings';
import {
  ConsolePage,
  ConsoleTableFrame,
} from '@/components/custom/console-page';
import { SearchInput } from '@/components/custom/search-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RequestProjectAccessButton } from '@/features/project-access-requests';
import { projectSharingUtils } from '@/features/project-members';
import { DisabledReason } from '@/features/project-workspace/components/disabled-reason';
import { ProjectInfoDialog } from '@/features/project-workspace/components/project-info-dialog';
import { ProjectMark } from '@/features/project-workspace/components/project-mark';
import { projectsListUtils } from '@/features/project-workspace/lib/projects-list-utils';
import { projectRoleLabels } from '@/features/project-workspace/lib/role-labels';
import {
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';
import { projectCollectionUtils } from '@/features/projects/stores/project-collection';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';

export function AllProjectsPage() {
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const { data, isLoading } = projectDirectoryHooks.useDirectory({
    primary: true,
  });
  const { data: accessibleProjects } = projectCollectionUtils.useAll();
  const personalIds = new Set(
    accessibleProjects
      .filter((project) => projectSharingUtils.isPersonal(project))
      .map((project) => project.id),
  );
  const me = authenticationSession.getCurrentUserId();
  const items = data ?? [];
  const mineCount = projectsListUtils.filter({
    items,
    tab: 'mine',
    query,
  }).length;
  const allCount = projectsListUtils.filter({
    items,
    tab: 'all',
    query,
  }).length;
  const shown = projectsListUtils.filter({ items, tab, query });

  const open = (item: ProjectDirectoryItem) => {
    if (!projectDirectoryUtils.isMember(item)) {
      toast.warning(notMemberReason(item));
      return;
    }
    projectCollectionUtils.setCurrentProject(
      item.id,
      `/projects/${item.id}/home`,
    );
  };

  return (
    <ConsolePage
      title={t('All projects')}
      description={t(
        'A project is the smallest management unit; permissions and data are isolated between projects.',
      )}
      actions={
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus />
          {t('New Project')}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value === 'all' ? 'all' : 'mine')}
        >
          <TabsList>
            <TabsTrigger value="mine">
              {t('My projects ({count})', { count: mineCount })}
            </TabsTrigger>
            <TabsTrigger value="all">
              {t('All projects ({count})', { count: allCount })}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto w-72">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('Search project name or description')}
          />
        </div>
      </div>
      <ConsoleTableFrame className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Project name')}</TableHead>
              <TableHead>{t('Description')}</TableHead>
              <TableHead className="w-24 text-right">
                {t('Workflows')}
              </TableHead>
              <TableHead className="w-28">{t('My access')}</TableHead>
              <TableHead className="w-40">{t('Owner')}</TableHead>
              <TableHead className="w-44">{t('Last updated')}</TableHead>
              <TableHead className="w-32">{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((item) => {
              const member = projectDirectoryUtils.isMember(item);
              const shareReason = shareDisabledReason({
                item,
                personal: personalIds.has(item.id),
              });
              return (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => open(item)}
                >
                  <TableCell className="max-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <ProjectMark name={item.displayName} icon={item.icon} />
                      <span className="truncate font-medium">
                        {item.displayName}
                      </span>
                      {!member && (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="size-3" />
                          {t('No access')}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <span
                      className="block truncate text-muted-foreground"
                      title={item.description ?? ''}
                    >
                      {item.description || t('No description')}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.workflowCount}
                  </TableCell>
                  <TableCell>
                    {member
                      ? projectRoleLabels.memberLabel({
                          role: item.myRole,
                          isOwner: item.ownerId === me,
                        })
                      : '—'}
                  </TableCell>
                  <TableCell className="max-w-0 truncate">
                    {item.ownerName ?? '—'}
                  </TableCell>
                  <TableCell>
                    {formatUtils.formatDateTime(new Date(item.updated))}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    {member ? (
                      <span className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          onClick={() => open(item)}
                        >
                          {t('Open')}
                        </Button>
                        <DisabledReason reason={shareReason}>
                          <Button
                            type="button"
                            variant="link"
                            size="xs"
                            disabled={Boolean(shareReason)}
                            onClick={() => setSharingId(item.id)}
                          >
                            {t('Share')}
                          </Button>
                        </DisabledReason>
                      </span>
                    ) : (
                      <RequestProjectAccessButton
                        projectId={item.id}
                        projectName={item.displayName}
                        variant="link"
                        size="xs"
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && shown.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-16 text-center text-muted-foreground"
                >
                  {query.trim().length > 0
                    ? t('No matching projects')
                    : t('No projects yet')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ConsoleTableFrame>
      <span className="text-xs text-muted-foreground">
        {t('{count} projects in total', { count: shown.length })}
      </span>
      {sharingId && (
        <ProjectSettingsDialog
          open
          onClose={() => setSharingId(null)}
          initialTab="members"
          projectId={sharingId}
        />
      )}
      <ProjectInfoDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(created) =>
          projectCollectionUtils.setCurrentProject(
            created.id,
            `/projects/${created.id}/home`,
          )
        }
      />
    </ConsolePage>
  );
}

function shareDisabledReason({
  item,
  personal,
}: {
  item: ProjectDirectoryItem;
  personal: boolean;
}): string | null {
  if (personal) {
    return projectSharingUtils.personalReason();
  }
  return projectDirectoryUtils.canEdit(item)
    ? null
    : t('Viewers cannot share the project');
}

function notMemberReason(item: ProjectDirectoryItem): string {
  return item.ownerName
    ? t('projectNotMemberRequestHintWithOwner', { owner: item.ownerName })
    : t('projectNotMemberRequestHint');
}
