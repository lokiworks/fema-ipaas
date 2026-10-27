import { isNil } from '@fema-ipaas/core-utils';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { Check, LogOut, Monitor, Moon, Sun, UserCogIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { UserAvatar } from '@/components/custom/user-avatar';
import { useEmbedding } from '@/components/providers/embed-provider';
import { useTelemetry } from '@/components/providers/telemetry-provider';
import { useTheme } from '@/components/providers/theme-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { userHooks } from '@/hooks/user-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { personName } from '@/lib/person-name';
import { cn } from '@/lib/utils';

export function SidebarUser() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { embedState } = useEmbedding();
  const { data: user } = userHooks.useCurrentUser();
  const queryClient = useQueryClient();
  const { reset } = useTelemetry();
  if (!user || embedState.isEmbedded) {
    return null;
  }

  const handleLogout = () => {
    userHooks.invalidateCurrentUser(queryClient);
    authenticationSession.logOut();
    reset();
  };

  return (
    <DropdownMenu modal>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('Account menu')}
          className="mt-1 flex size-9 items-center justify-center rounded-full transition-shadow hover:ring-2 hover:ring-rail-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div
            className={cn(
              'size-7 shrink-0 overflow-hidden rounded-full',
              isNil(user.imageUrl) && 'flex items-center justify-center',
            )}
          >
            <UserAvatar
              className={cn('size-full object-cover', {
                'scale-150': isNil(user.imageUrl),
              })}
              name={personName.format(user)}
              email={user.email}
              imageUrl={user.imageUrl}
              size={28}
              disableTooltip={true}
            />
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg z-999"
        side="right"
        align="end"
        sideOffset={10}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <div className="size-8 shrink-0 overflow-hidden rounded-full">
              <UserAvatar
                className="size-full object-cover"
                name={personName.format(user)}
                email={user.email}
                imageUrl={user.imageUrl}
                size={32}
                disableTooltip={true}
              />
            </div>

            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {personName.format(user)}
              </span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => navigate('/account')}>
            <UserCogIcon className="w-4 h-4 mr-2" />
            {t('Personal settings')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t('Appearance')}
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="w-4 h-4 mr-2" />
          {t('Light')}
          {theme === 'light' && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="w-4 h-4 mr-2" />
          {t('Dark')}
          {theme === 'dark' && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="w-4 h-4 mr-2" />
          {t('Follow system')}
          {theme === 'system' && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          {t('Log out')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
