import { Template, WorkflowReleaseStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  Clock,
  LayoutTemplate,
  Plus,
  RefreshCw,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { GenerateWorkflowDialog } from '@/features/ai/components/generate-workflow-dialog';
import { DisabledReason } from '@/features/project-workspace/components/disabled-reason';
import { OverviewSideCards } from '@/features/project-workspace/components/overview-side-cards';
import { OverviewStatCards } from '@/features/project-workspace/components/overview-stat-cards';
import { OverviewWorkflowTable } from '@/features/project-workspace/components/overview-workflow-table';
import { ProjectMark } from '@/features/project-workspace/components/project-mark';
import { projectWorkspaceHooks } from '@/features/project-workspace/hooks/project-workspace-hooks';
import {
  useWorkspaceContext,
  WorkspaceContext,
} from '@/features/project-workspace/hooks/use-workspace-context';
import { projectRoleLabels } from '@/features/project-workspace/lib/role-labels';
import { projectDirectoryHooks } from '@/features/projects/api/project-directory-api';
import { projectCollectionUtils } from '@/features/projects/stores/project-collection';
import { releasesHooks } from '@/features/releases/hooks/releases-hooks';
import {
  TemplateCard,
  TemplateDetailDrawer,
  TemplatePickerDialog,
  templatesHooks,
} from '@/features/templates';
import { NewWorkflowDialog } from '@/features/workflows/components/new-workflow-dialog';
import { formatUtils } from '@/lib/format-utils';

import { ProjectSettingsDialog } from '../../components/project-settings';

export function HomePage() {
  const { project } = projectCollectionUtils.useCurrentProject();
  const context = useWorkspaceContext(project);
  const [searchParams] = useSearchParams();
  const [dialog, setDialog] = useState<OverviewDialog | null>(() =>
    searchParams.get('share') ? 'share' : null,
  );
  const close = () => setDialog(null);
  const { canEdit } = context.permissions;
  const viewerReason = canEdit ? null : projectRoleLabels.viewerHint();
  const createReason =
    viewerReason ??
    (context.limitReached
      ? t('The project has reached its workflow limit')
      : null);

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => setDialog('share')}
      >
        {canEdit ? <Share2 /> : <Users />}
        {canEdit ? t('Share') : t('View members')}
      </Button>
      <DisabledReason reason={createReason}>
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(createReason)}
          onClick={() => setDialog('template')}
        >
          <LayoutTemplate />
          {t('New from template')}
        </Button>
      </DisabledReason>
      <DisabledReason reason={createReason}>
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(createReason)}
          onClick={() => setDialog('ai')}
        >
          <Sparkles />
          {t('Create with AI')}
        </Button>
      </DisabledReason>
      <DisabledReason reason={createReason}>
        <Button
          type="button"
          disabled={Boolean(createReason)}
          onClick={() => setDialog('new')}
        >
          <Plus />
          {t('New workflow')}
        </Button>
      </DisabledReason>
    </div>
  );

  const dialogs = (
    <>
      {dialog === 'new' && (
        <NewWorkflowDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={project.id}
        />
      )}
      {dialog === 'ai' && (
        <GenerateWorkflowDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={project.id}
        />
      )}
      {dialog === 'template' && (
        <TemplatePickerDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={project.id}
        />
      )}
      {dialog === 'share' && (
        <ProjectSettingsDialog
          open
          onClose={close}
          initialTab="members"
          initialValues={{ projectName: project.displayName }}
        />
      )}
    </>
  );

  if (context.tree.isSuccess && context.workflows.length === 0) {
    return (
      <EmptyProjectLanding
        context={context}
        createReason={createReason}
        onAction={setDialog}
        dialogs={dialogs}
      />
    );
  }

  return (
    <ProjectOverview
      context={context}
      actions={actions}
      onShare={() => setDialog('share')}
    >
      {dialogs}
    </ProjectOverview>
  );
}

function ProjectOverview({
  context,
  actions,
  onShare,
  children,
}: {
  context: WorkspaceContext;
  actions: React.ReactNode;
  onShare: () => void;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { project, permissions, releasesEnabled } = context;
  const { data: stats, isLoading } = projectWorkspaceHooks.useStats(project.id);
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const directoryItem = directory?.find((item) => item.id === project.id);
  const { data: myPending } = releasesHooks.useReleases({
    projectId: project.id,
    mine: 'approver',
    status: WorkflowReleaseStatus.PENDING,
    limit: 3,
  });
  const pending = releasesEnabled ? myPending?.data ?? [] : [];
  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ProjectMark
            name={project.displayName}
            icon={project.icon}
            className="size-11 text-lg"
          />
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-2xl font-semibold">
              {project.displayName}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {project.description || t('No description')}
            </p>
          </div>
        </div>
        {actions}
      </header>
      {!permissions.canEdit && (
        <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          {t(
            'You have "Can view" access in this project and cannot create, edit or publish workflows.',
          )}
        </p>
      )}
      {pending.length > 0 && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <Clock className="size-4" />
              {t('{count} releases are waiting for your approval', {
                count: pending.length,
              })}
            </span>
            {pending.map((release) => (
              <span key={release.id} className="truncate text-muted-foreground">
                {t('{name} promotion to production · requested {time}', {
                  name: release.workflowDisplayName,
                  time: formatUtils.formatDateToAgo(new Date(release.created)),
                })}
              </span>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant={pending.length === 1 ? 'default' : 'outline'}
            onClick={() =>
              navigate(
                pending.length === 1
                  ? `/projects/${project.id}/releases/${pending[0].id}`
                  : `/projects/${project.id}/releases`,
              )
            }
          >
            {pending.length === 1 ? t('Review') : t('View all')}
          </Button>
        </div>
      )}
      <OverviewStatCards
        context={context}
        stats={stats}
        isLoading={isLoading}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <OverviewWorkflowTable context={context} stats={stats} />
        <OverviewSideCards
          context={context}
          stats={stats}
          directoryItem={directoryItem}
          onShare={onShare}
        />
      </div>
      {children}
    </div>
  );
}

function EmptyProjectLanding({
  context,
  createReason,
  onAction,
  dialogs,
}: {
  context: WorkspaceContext;
  createReason: string | null;
  onAction: (dialog: OverviewDialog) => void;
  dialogs: React.ReactNode;
}) {
  const [batch, setBatch] = useState(0);
  const [picked, setPicked] = useState<Template | null>(null);
  const { templates } = templatesHooks.useRecommendedTemplates();
  const shown = rotate({ items: templates, batch, size: 4 });
  const { canEdit } = context.permissions;
  return (
    <div className="flex flex-col gap-6 p-6">
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <h1 className="text-2xl font-semibold">{t('Business integration')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('In this project you can:')}
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>
            {t('Describe a need in one sentence and let AI draft the workflow')}
          </li>
          <li>{t('Start from templates to build workflows faster')}</li>
          <li>{t('Watch how workflows run through the run logs')}</li>
          <li>
            {t(
              'Manage workflows and data stores per project, and assign member access',
            )}
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <DisabledReason reason={createReason}>
            <Button
              type="button"
              size="lg"
              disabled={Boolean(createReason)}
              onClick={() => onAction('new')}
            >
              <Plus />
              {t('New workflow')}
            </Button>
          </DisabledReason>
          <DisabledReason reason={createReason}>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={Boolean(createReason)}
              onClick={() => onAction('ai')}
            >
              <Sparkles />
              {t('Create with AI')}
            </Button>
          </DisabledReason>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => onAction('share')}
          >
            {canEdit ? <Share2 /> : <Users />}
            {canEdit ? t('Share project') : t('View members')}
          </Button>
        </div>
        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            {t(
              'You have "Can view" access in this project. The templates below can be used in projects you can edit.',
            )}
          </p>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">
            {t('Create a workflow from a template')}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={templates.length <= 4}
            onClick={() => setBatch((current) => current + 1)}
          >
            <RefreshCw />
            {t('Show others')}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onClick={setPicked}
            />
          ))}
          {shown.length === 0 && (
            <span className="text-sm text-muted-foreground">
              {t('No templates yet')}
            </span>
          )}
        </div>
      </section>
      <TemplateDetailDrawer
        template={picked}
        open={picked !== null}
        onOpenChange={(open) => !open && setPicked(null)}
        projectId={context.projectId}
      />
      {dialogs}
    </div>
  );
}

function rotate<T>({
  items,
  batch,
  size,
}: {
  items: T[];
  batch: number;
  size: number;
}): T[] {
  if (items.length <= size) {
    return items;
  }
  return Array.from(
    { length: size },
    (_, index) => items[(batch * size + index) % items.length],
  );
}

type OverviewDialog = 'new' | 'ai' | 'template' | 'share';
