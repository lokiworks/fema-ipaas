import { isNil, Permission } from '@fema-ipaas/core-utils';
import { ProjectDirectoryItem, rolePermissions } from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useGlobalSearch } from '@/app/components/global-search/global-search-context';
import { Skeleton } from '@/components/ui/skeleton';
import { GenerateWorkflowDialog } from '@/features/ai';
import { launchTour } from '@/features/help';
import {
  HOME_RECENT_LIMIT,
  HomeAiBox,
  HomeAttentionCard,
  HomeHero,
  HomeIssuesCard,
  HomeLearnCard,
  HomeOnboardingCard,
  HomeProjects,
  HomeRecentVisits,
  HomeTemplates,
  HomeTodayRunsCard,
  HomeTodosCard,
  homeHooks,
  homeUtils,
} from '@/features/home';
import {
  PROJECT_DIRECTORY_QUERY_KEY,
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';
import { SetupChecklistCard } from '@/features/system';
import { NewWorkflowDialog } from '@/features/workflows';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';
import { flagsHooks } from '@/hooks/flags-hooks';
import { tenantHooks } from '@/hooks/tenant-hooks';
import { userHooks } from '@/hooks/user-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { recentVisits } from '@/lib/recent-visits';

export function WorkspaceHomePage() {
  const [now] = useState(() => new Date());
  const since = homeUtils.localMidnight(now).toISOString();
  const queryClient = useQueryClient();
  const { setOpen: setSearchOpen } = useGlobalSearch();
  const { data: user } = userHooks.useCurrentUser();
  const { tenant } = tenantHooks.useCurrentTenant();
  const branding = flagsHooks.useWebsiteBranding();
  const isTenantAdmin = useIsTenantAdmin();
  const { data: directory, isLoading: isDirectoryLoading } =
    projectDirectoryHooks.useDirectory({ primary: true });
  const { data: summary } = homeHooks.useSummary({ since });
  const [newWorkflowOpen, setNewWorkflowOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);

  const projects = (directory ?? []).filter(projectDirectoryUtils.isMember);
  const memberProjectIds = projects.map((project) => project.id);
  const currentProjectId = authenticationSession.getProjectId();
  const fallbackProjectId =
    memberProjectIds.find((id) => id === currentProjectId) ??
    memberProjectIds[0] ??
    null;
  const hasEditable = projects.some(projectDirectoryUtils.canEdit);
  const targetProject = homeUtils.pickTargetProject({
    projects,
    currentProjectId,
    canCreate: projectDirectoryUtils.canCreateWorkflow,
  });
  const newWorkflowDisabledReason = hasEditable ? null : NO_EDITABLE_PROJECT;
  const visits = homeUtils.visibleRecentVisits({
    visits: recentVisits.list(),
    memberProjectIds,
    limit: HOME_RECENT_LIMIT,
  });
  const refreshProjects = () => {
    queryClient.invalidateQueries({ queryKey: PROJECT_DIRECTORY_QUERY_KEY });
  };

  return (
    <div className="flex w-full max-w-[1440px] flex-col gap-6 p-6">
      <HomeHero
        userName={user?.firstName || user?.email || ''}
        tenantName={tenant.name}
        now={now}
        newWorkflowDisabledReason={newWorkflowDisabledReason}
        onSearch={() => setSearchOpen(true)}
        onNewWorkflow={() => setNewWorkflowOpen(true)}
      />
      <HomeAiBox
        disabledReason={newWorkflowDisabledReason}
        onSubmit={setAiPrompt}
      />
      {!isDirectoryLoading && (
        <HomeOnboardingCard
          productName={branding.websiteName}
          hasProject={projects.length > 0}
          hasWorkflow={projects.some((project) => project.workflowCount > 0)}
          canCreateWorkflow={hasEditable}
          onProjectCreated={refreshProjects}
          onNewWorkflow={() => setNewWorkflowOpen(true)}
          onStartTour={() => launchTour('console')}
        />
      )}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <HomeRecentVisits visits={visits} projects={projects} />
          {isDirectoryLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <HomeProjects
              projects={projects}
              onProjectCreated={refreshProjects}
            />
          )}
          <HomeTemplates projectId={targetProject?.id ?? null} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <HomeTodosCard
            todos={summary?.todos ?? []}
            total={summary?.todoTotal ?? 0}
          />
          <HomeTodayRunsCard
            runs={summary?.runs}
            projects={projects}
            fallbackProjectId={fallbackProjectId}
            now={now}
          />
          {summary && (
            <HomeAttentionCard
              failedRuns={summary.failedRuns}
              brokenConnections={summary.brokenConnections}
              runs={summary.runs}
              projects={projects}
              fallbackProjectId={fallbackProjectId}
            />
          )}
          <HomeIssuesCard />
          {isTenantAdmin && <SetupChecklistCard />}
          <HomeLearnCard mcpProjectId={mcpProjectIdFor(projects)} />
        </div>
      </div>
      <NewWorkflowDialog
        open={newWorkflowOpen}
        onOpenChange={setNewWorkflowOpen}
        projectId={targetProject?.id}
        pickProject={true}
      />
      <GenerateWorkflowDialog
        open={aiPrompt !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAiPrompt(null);
          }
        }}
        initialPrompt={aiPrompt ?? undefined}
        projectId={targetProject?.id}
      />
    </div>
  );
}

function mcpProjectIdFor(projects: ProjectDirectoryItem[]): string | null {
  const project = projects.find((item) => {
    const role = item.myRole;
    return (
      !isNil(role) &&
      rolePermissions[role].includes(Permission.READ_MCP_SERVICE)
    );
  });
  return project?.id ?? null;
}

const NO_EDITABLE_PROJECT =
  'You have no editable project yet. Create a project first.';
