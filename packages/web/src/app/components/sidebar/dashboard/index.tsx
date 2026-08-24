import { isNil } from '@fema-ipaas/core-utils';
import {
  WORKSPACE_COLOR_PALETTE,
  TenantRole,
  WorkspaceType,
  TemplateTelemetryEventType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Search } from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDebounce } from 'use-debounce';

import { SearchInput } from '@/components/custom/search-input';
import { CompassIcon } from '@/components/icons/compass';
import { ShieldIcon } from '@/components/icons/shield';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarSeparator,
  useSidebar,
  SidebarGroupLabel,
  SidebarMenuItem,
} from '@/components/ui/sidebar-shadcn';
import { VirtualizedScrollArea } from '@/components/ui/virtualized-scroll-area';
import { templatesTelemetryApi } from '@/features/templates';
import {
  CreateWorkspaceButton,
  workspaceCollectionUtils,
  getWorkspaceName,
} from '@/features/workspaces';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';
import { userHooks } from '@/hooks/user-hooks';
import { cn } from '@/lib/utils';

import { recordAccess } from '../../global-search/access-history';
import { GlobalSearchCommand } from '../../global-search/global-search-command';
import { STATIC_PAGES } from '../../global-search/static-pages';
import { SidebarGeneralItemType } from '../ap-sidebar-group';
import { ApSidebarItem, SidebarItemType } from '../ap-sidebar-item';
import { AppSidebarHeader } from '../sidebar-header';
import { SidebarUser } from '../sidebar-user';
import WorkspaceSideBarItem from '../workspace';

export function WorkspaceDashboardSidebar({
  className,
}: { className?: string } = {}) {
  const { data: workspaces } = workspaceCollectionUtils.useAll();
  const { embedState } = useEmbedding();
  const { state } = useSidebar();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { data: currentUser } = userHooks.useCurrentUser();
  useEffect(() => {
    if (!searchOpen) {
      setSearchQuery('');
    }
  }, [searchOpen]);

  const shouldShowNewWorkspaceButton =
    currentUser?.tenantRole === TenantRole.ADMIN;

  const shouldShowInlineAddButton =
    currentUser?.tenantRole === TenantRole.ADMIN &&
    workspaces.filter((workspace) => workspace.type === WorkspaceType.TEAM)
      .length === 0;

  const isSearchMode = debouncedSearchQuery.length > 0;

  const displayWorkspaces = useMemo(() => {
    if (isSearchMode) {
      const query = debouncedSearchQuery.toLowerCase();
      return workspaces.filter((workspace) =>
        workspace.displayName.toLowerCase().includes(query),
      );
    }
    return workspaces;
  }, [isSearchMode, debouncedSearchQuery, workspaces]);
  const handleWorkspaceSelect = useCallback(
    async (workspaceId: string) => {
      const workspace = workspaces.find((p) => p.id === workspaceId);
      if (workspace) {
        const palette = workspace.icon
          ? WORKSPACE_COLOR_PALETTE[workspace.icon.color]
          : null;
        const name = getWorkspaceName(workspace);
        recordAccess({
          id: `workspace-${workspaceId}`,
          type: 'workspace',
          label: name,
          href: `/workspaces/${workspaceId}/automations`,
          iconBgColor: palette?.color,
          iconTextColor: palette?.textColor,
          iconLetter: name.charAt(0).toUpperCase(),
        });
      }
      workspaceCollectionUtils.setCurrentWorkspace(workspaceId);
      navigate(`/workspaces/${workspaceId}/automations`);
      setSearchOpen(false);
    },
    [navigate, workspaces],
  );

  const permissionFilter = (link: SidebarGeneralItemType) => {
    if (link.type === 'link') {
      return isNil(link.hasPermission) || link.hasPermission;
    }
    return true;
  };
  const handleExploreClick = useCallback(() => {
    templatesTelemetryApi.sendEvent({
      eventType: TemplateTelemetryEventType.EXPLORE_VIEW,
      userId: currentUser?.id,
    });
  }, []);

  const exploreLink: SidebarItemType = {
    type: 'link',
    to: '/templates',
    label: t('Explore'),
    show: true,
    icon: CompassIcon,
    hasPermission: true,
    isSubItem: false,
    onClick: () => {
      handleExploreClick();
      const page = STATIC_PAGES.find((p) => p.href === '/templates');
      if (page)
        recordAccess({
          id: page.id,
          type: 'page',
          label: page.label,
          href: page.href,
        });
    },
  };

  const items = [exploreLink]
    .filter((item) => item.show !== false)
    .filter(permissionFilter);

  return (
    !embedState.hideSideNav && (
      <Sidebar
        collapsible="icon"
        id={SIDEBAR_ID}
        className={cn('max-h-[100vh]', className)}
      >
        <AppSidebarHeader />

        <SidebarContent className="overflow-x-hidden">
          <SidebarGroup>
            <div className="mb-1 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
              <GlobalSearchCommand />
            </div>
            <SidebarMenu>
              {items.map((item) => (
                <ApSidebarItem key={item.label} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup className="flex-1 overflow-hidden">
            <div className="flex items-center justify-between group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>{t('Workspaces')}</SidebarGroupLabel>
              <div className="flex items-center justify-center gap-2">
                {shouldShowNewWorkspaceButton && (
                  <CreateWorkspaceButton
                    variant="icon"
                    workspaces={workspaces ?? []}
                    onCreate={(workspace) => {
                      navigate(`/workspaces/${workspace.id}/workflows`);
                    }}
                  />
                )}
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-accent"
                    >
                      <Search />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[280px] p-3"
                    align="start"
                    side="right"
                    sideOffset={8}
                  >
                    <SearchInput
                      placeholder={t('Search workspaces...')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e)}
                      className="h-8"
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div
              className="flex-1 grow min-h-0 flex flex-col overflow-hidden"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <div className="flex max-h-[100%]">
                {displayWorkspaces.length > 0 ? (
                  <VirtualizedScrollArea
                    className={cn(
                      'flex-1',
                      state === 'collapsed'
                        ? 'flex flex-col items-center scrollbar-none'
                        : '',
                    )}
                    items={displayWorkspaces}
                    estimateSize={() => 35}
                    getItemKey={(index) =>
                      displayWorkspaces[index]?.id ?? index
                    }
                    overscan={10}
                    renderItem={(workspace) => (
                      <SidebarMenuItem className="w-full">
                        <WorkspaceSideBarItem
                          key={workspace.id}
                          workspace={workspace}
                          isCurrentWorkspace={
                            location.pathname.includes(
                              `/workspaces/${workspace.id}`,
                            ) && !location.pathname.includes('/agents')
                          }
                          handleWorkspaceSelect={handleWorkspaceSelect}
                        />
                      </SidebarMenuItem>
                    )}
                  />
                ) : (
                  isSearchMode && (
                    <div className="px-2 py-2 text-sm text-muted-foreground">
                      {state === 'expanded' && t('No workspaces found.')}
                    </div>
                  )
                )}
              </div>
              {shouldShowInlineAddButton && state === 'expanded' && (
                <SidebarMenu>
                  <SidebarMenuItem>
                    <CreateWorkspaceButton
                      variant="sidebar-menu"
                      workspaces={workspaces ?? []}
                      onCreate={(workspace) => {
                        navigate(`/workspaces/${workspace.id}/workflows`);
                      }}
                    />
                  </SidebarMenuItem>
                </SidebarMenu>
              )}
            </div>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          {state === 'expanded' && <DelayedSidebarUsageLimits />}
          <SidebarTenantAdminLink />
          <SidebarUser />
        </SidebarFooter>
      </Sidebar>
    )
  );
}

function DelayedSidebarUsageLimits() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 250);
    return () => clearTimeout(timer);
  }, []);

  return show ? null : null;
}

function SidebarTenantAdminLink() {
  const showTenantAdmin = useIsTenantAdmin();
  const { embedState } = useEmbedding();

  if (embedState.isEmbedded || !showTenantAdmin) {
    return null;
  }

  return (
    <SidebarMenu>
      <ApSidebarItem
        type="link"
        to="/tenant/workspaces"
        label={t('Tenant Admin')}
        icon={ShieldIcon}
        isSubItem={false}
        show={true}
        hasPermission={true}
        onClick={() => {
          const page = STATIC_PAGES.find(
            (p) =>
              p.href === '/tenant/workspaces' && p.id === 'page-tenant-admin',
          );
          if (page)
            recordAccess({
              id: page.id,
              type: 'page',
              label: page.label,
              href: page.href,
            });
        }}
      />
    </SidebarMenu>
  );
}

export const SIDEBAR_ID = 'workspace-sidebar';
