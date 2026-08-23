import { t } from 'i18next';
import { Check, Plus } from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { workspaceHooks } from '@/features/workspaces/stores/workspace-collection';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { ScrollArea } from '../../../components/ui/scroll-area';
import { tenantHooks } from '../../../hooks/tenant-hooks';

import { CreateTenantDialog } from './create-tenant-dialog';

export function TenantSwitcher({ children }: { children: React.ReactNode }) {
  const { data: allWorkspaces } = workspaceHooks.useWorkspacesForTenants();
  const { tenant: currentTenant } = tenantHooks.useCurrentTenant();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const isCloud = false;

  const tenants = React.useMemo(() => {
    if (!allWorkspaces) return [];
    return allWorkspaces.map((tenant) => ({
      name: tenant.tenantName,
      id: tenant.workspaces[0]?.tenantId,
    }));
  }, [allWorkspaces]);

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
      {isCloud && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setCreateDialogOpen(true)}
            className="text-sm p-2 cursor-pointer"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('Create Tenant')}
          </DropdownMenuItem>
        </>
      )}
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
      {isCloud && (
        <CreateTenantDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />
      )}
    </>
  );
}
