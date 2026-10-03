import { t } from 'i18next';
import { ChevronDown, MenuIcon } from 'lucide-react';
import { useEffect } from 'react';
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
import { useSidebar } from '@/components/ui/sidebar-shadcn';
import { projectCollectionUtils } from '@/features/projects/stores/project-collection';

import { ProjectNavColumn } from './project-nav-column';

export function MobileNavBar({
  showProjectNav,
  showMenu = true,
}: MobileNavBarProps) {
  const { setOpenMobile } = useSidebar();
  const location = useLocation();

  useEffect(() => {
    setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2">
      {showMenu && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('Open menu')}
          onClick={() => setOpenMobile(true)}
        >
          <MenuIcon className="size-5" />
        </Button>
      )}
      {showProjectNav && (
        <MobileProjectNav key={`${location.pathname}${location.search}`} />
      )}
    </div>
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
      <SheetContent side="left" className="w-72 max-w-[85vw] gap-0 p-0">
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
};
