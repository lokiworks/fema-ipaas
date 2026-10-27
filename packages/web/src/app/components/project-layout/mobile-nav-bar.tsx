import { t } from 'i18next';
import { ChevronDown, MenuIcon } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { projectCollectionUtils } from '@/features/projects/stores/project-collection';

import { GlobalRail } from '../global-rail';
import { TenantSidebar, tenantSidebarUtils } from '../sidebar/tenant';

import { ProjectNavColumn } from './project-nav-column';

export function MobileNavBar({
  showProjectNav,
  showMenu = true,
  showTenantMenu = false,
}: MobileNavBarProps) {
  const location = useLocation();

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2">
      {showMenu && (
        <Sheet key={location.pathname}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('Open menu')}
            >
              <MenuIcon className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            hideCloseButton
            className="w-16 gap-0 border-0 p-0"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t('Main navigation')}</SheetTitle>
              <SheetDescription>{t('Main navigation')}</SheetDescription>
            </SheetHeader>
            <GlobalRail />
          </SheetContent>
        </Sheet>
      )}
      {showTenantMenu && (
        <MobileTenantNav key={`tenant-${location.pathname}`} />
      )}
      {showProjectNav && (
        <MobileProjectNav key={`${location.pathname}${location.search}`} />
      )}
    </div>
  );
}

function MobileTenantNav() {
  const { pathname } = useLocation();
  const title = tenantSidebarUtils.isConnectorsModule(pathname)
    ? t('Connectors')
    : t('Tenant Admin');
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="min-w-0 flex-1 justify-between gap-2"
          aria-label={title}
        >
          <span className="min-w-0 truncate text-sm font-medium">{title}</span>
          <ChevronDown className="size-4 shrink-0" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        hideCloseButton
        className="w-64 max-w-[85vw] gap-0 p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{title}</SheetDescription>
        </SheetHeader>
        <TenantSidebar className="w-full border-r-0" />
      </SheetContent>
    </Sheet>
  );
}

function MobileProjectNav() {
  const { project } = projectCollectionUtils.useCurrentProject();
  if (!project) {
    return null;
  }
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="min-w-0 flex-1 justify-between gap-2"
          aria-label={t('Project navigation')}
        >
          <span className="min-w-0 truncate text-sm font-medium">
            {project.displayName}
          </span>
          <ChevronDown className="size-4 shrink-0" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        hideCloseButton
        className="w-72 max-w-[85vw] gap-0 p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t('Project navigation')}</SheetTitle>
          <SheetDescription>{t('Project navigation')}</SheetDescription>
        </SheetHeader>
        <ProjectNavColumn className="w-full border-r-0" />
      </SheetContent>
    </Sheet>
  );
}

type MobileNavBarProps = {
  showProjectNav: boolean;
  showMenu?: boolean;
  showTenantMenu?: boolean;
};
