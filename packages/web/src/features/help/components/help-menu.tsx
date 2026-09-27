import { t } from 'i18next';
import {
  BookOpen,
  CircleHelp,
  Compass,
  Keyboard,
  MousePointerClick,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar-shadcn';

import { helpStore } from '../lib/help-store';

import { launchTour } from './tour-host';

export function HelpMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const startConsoleTour = () => {
    if (location.pathname === '/') {
      launchTour('console');
      return;
    }
    navigate('/');
    setTimeout(() => launchTour('console'), TOUR_NAVIGATION_DELAY_MS);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton aria-label={t('Help')}>
              <CircleHelp className="size-4" />
              {!isCollapsed && <span className="text-sm">{t('Help')}</span>}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-64">
            <DropdownMenuLabel>{t('Interactive tutorials')}</DropdownMenuLabel>
            <DropdownMenuItem onClick={startConsoleTour}>
              <Compass className="mr-2 size-4" />
              {t('Get to know the console')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => launchTour('editor')}>
              <MousePointerClick className="mr-2 size-4" />
              {t('Get to know the workflow editor')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('Help articles')}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => helpStore.openHelp()}>
              <BookOpen className="mr-2 size-4" />
              {t('All help articles')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => helpStore.openHelp('shortcuts')}>
              <Keyboard className="mr-2 size-4" />
              {t('Keyboard shortcuts')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

const TOUR_NAVIGATION_DELAY_MS = 500;
