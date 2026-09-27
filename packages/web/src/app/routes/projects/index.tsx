import { ProjectDirectoryItem } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

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
import { formatUtils } from '@/lib/format-utils';

export function AllProjectsPage() {
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = projectDirectoryHooks.useDirectory({
    primary: true,
  });
  const items = data ?? [];
  const mineCount = items.filter((item) =>
    projectDirectoryUtils.isMember(item),
  ).length;
  const shown = projectsListUtils.filter({ items, tab, query });

  const open = (item: ProjectDirectoryItem, suffix = '') => {
    if (!projectDirectoryUtils.isMember(item)) {
      toast.warning(
        t(
          'You are not a member of this project. Ask the project owner to share it with you.',
        ),
      );
      return;
    }
    projectCollectionUtils.setCurrentProject(
      item.id,
      `/projects/${item.id}/home${suffix}`,
    );
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('All projects')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'A project is the smallest management unit; permissions and data are isolated between projects.',
            )}
          </p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus />
          {t('New Project')}
        </Button>
      </header>
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
              {t('All projects ({count})', { count: items.length })}
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
      <div className="rounded-lg border">
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
              const canShare = projectDirectoryUtils.canEdit(item);
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
                      {item.description || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.workflowCount}
                  </TableCell>
                  <TableCell>
                    {member ? projectRoleLabels.label(item.myRole) : '—'}
                  </TableCell>
                  <TableCell className="max-w-0 truncate">
                    {item.ownerName ?? '—'}
                  </TableCell>
                  <TableCell>
                    {formatUtils.formatDateTime(new Date(item.updated))}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <span className="flex items-center gap-1">
                      <DisabledReason
                        reason={
                          member
                            ? null
                            : t('You are not a member of this project')
                        }
                      >
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          disabled={!member}
                          onClick={() => open(item)}
                        >
                          {t('Open')}
                        </Button>
                      </DisabledReason>
                      <DisabledReason
                        reason={
                          !member
                            ? t('You are not a member of this project')
                            : canShare
                            ? null
                            : t('Viewers cannot share the project')
                        }
                      >
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          disabled={!canShare}
                          onClick={() => open(item, '?share=1')}
                        >
                          {t('Share')}
                        </Button>
                      </DisabledReason>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-muted-foreground">
                  {query.trim().length > 0
                    ? t('No matching projects')
                    : t('No projects yet')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <span className="text-xs text-muted-foreground">
        {t('{count} projects in total', { count: shown.length })}
      </span>
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
    </div>
  );
}
