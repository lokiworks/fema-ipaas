import { isNil, Permission } from '@fema-ipaas/core-utils';
import { FlagId, WorkspaceType } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { UsersRound, Lock } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { AnimatedIconButton } from '@/components/custom/animated-icon-button';
import { PageHeader } from '@/components/custom/page-header';
import { SettingsIcon } from '@/components/icons/settings';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getWorkspaceName,
  workspaceCollectionUtils,
} from '@/features/workspaces';
import { WorkspaceDisplay } from '@/features/workspaces/components/workspace-display';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { flagsHooks } from '@/hooks/flags-hooks';

import { WorkspaceSettingsDialog } from '../workspace-settings';

export const WorkspaceDashboardPageHeader = ({
  children,
  description,
}: {
  children?: React.ReactNode;
  description?: React.ReactNode;
}) => {
  const { workspace } = workspaceCollectionUtils.useCurrentWorkspace();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'general' | 'members' | 'alerts' | 'connectors' | 'environment'
  >('general');
  const location = useLocation();
  const activeWorkspaceMembers = undefined as { length: number } | undefined;
  const { checkAccess } = useAuthorization();
  const userHasPermissionToReadWorkspaceMembers = checkAccess(
    Permission.READ_WORKSPACE_MEMBER,
  );

  const { data: showWorkspaceMembersFlag } = flagsHooks.useFlag<boolean>(
    FlagId.SHOW_WORKSPACE_MEMBERS,
  );

  const showWorkspaceMembersIcons =
    showWorkspaceMembersFlag &&
    userHasPermissionToReadWorkspaceMembers &&
    !isNil(activeWorkspaceMembers) &&
    workspace.type === WorkspaceType.TEAM;

  const isWorkspacePage = location.pathname.includes('/workspaces/');

  const hasGeneralSettings = workspace.type === WorkspaceType.TEAM;

  const getFirstAvailableTab = ():
    | 'general'
    | 'members'
    | 'alerts'
    | 'connectors'
    | 'environment' => {
    if (hasGeneralSettings) return 'general';
    if (
      workspace.type === WorkspaceType.TEAM &&
      showWorkspaceMembersFlag &&
      userHasPermissionToReadWorkspaceMembers
    )
      return 'members';
    return 'connectors';
  };

  const titleContent = (
    <div className="flex items-center gap-1">
      <WorkspaceDisplay
        title={getWorkspaceName(workspace)}
        maxLengthToNotShowTooltip={30}
        titleClassName="text-sm font-medium"
        workspaceType={workspace.type}
      />
      {workspace.type === WorkspaceType.PERSONAL && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Lock className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {t(
                  'This is your private workspace. Only you can see and access it.',
                )}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );

  const rightContent = isWorkspacePage ? (
    <div className="flex items-center gap-3">
      {showWorkspaceMembersIcons && (
        <Button
          variant="ghost"
          className="gap-2"
          aria-label={`View ${activeWorkspaceMembers?.length} team member${
            activeWorkspaceMembers?.length !== 1 ? 's' : ''
          }`}
          onClick={() => {
            setSettingsInitialTab('members');
            setSettingsOpen(true);
          }}
        >
          <UsersRound className="w-4 h-4" />
          <span className="text-sm font-medium">
            {activeWorkspaceMembers?.length}
          </span>
        </Button>
      )}
      <AnimatedIconButton
        icon={SettingsIcon}
        iconSize={16}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => {
          setSettingsInitialTab(getFirstAvailableTab());
          setSettingsOpen(true);
        }}
      />
    </div>
  ) : (
    children
  );

  return (
    <>
      <PageHeader
        title={titleContent}
        description={description}
        rightContent={rightContent}
        showSidebarToggle={true}
        className="min-w-full"
      />
      <WorkspaceSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsInitialTab}
        initialValues={{
          workspaceName: workspace?.displayName,
        }}
      />
    </>
  );
};
