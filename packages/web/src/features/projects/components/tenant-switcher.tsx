import { t } from 'i18next';
import { Check } from 'lucide-react';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { projectHooks } from '@/features/projects/stores/project-collection';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { ScrollArea } from '../../../components/ui/scroll-area';
import { tenantHooks } from '../../../hooks/tenant-hooks';

export function TenantSwitcher({ children }: { children: React.ReactNode }) {
  const { data: allProjects } = projectHooks.useProjectsForTenants();
  const { tenant: currentTenant } = tenantHooks.useCurrentTenant();

  const tenants = React.useMemo(() => {
    if (!allProjects) return [];
    return allProjects.map((tenant) => ({
      name: tenant.tenantName,
      id: tenant.projects[0]?.tenantId,
    }));
  }, [allProjects]);

  const handleTenantSwitch = async (tenantId: string) => {
    await authenticationSession.switchToTenant(tenantId);
  };

  const dropdownContent = (
    <DropdownMenuContent
      className="w-56 rounded-lg z-60"
      align="start"
      side="right"
      sideOffset={4}
    >
      <div className="px-2 py-1.5">
        <p className="text-xs text-muted-foreground">{t('Tenants')}</p>
      </div>
      <ScrollArea viewPortClassName="max-h-[400px]">
        {tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onClick={() => handleTenantSwitch(tenant.id)}
            className="text-sm p-2 break-all cursor-pointer"
          >
            {tenant.name}
            <Check
              className={cn(
                'ml-auto h-4 w-4 shrink-0',
                currentTenant?.id === tenant.id ? 'opacity-100' : 'opacity-0',
              )}
            />
          </DropdownMenuItem>
        ))}
      </ScrollArea>
    </DropdownMenuContent>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="w-full">
          {children}
        </DropdownMenuTrigger>
        {dropdownContent}
      </DropdownMenu>
    </>
  );
}
