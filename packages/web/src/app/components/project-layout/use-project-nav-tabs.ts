import { Permission } from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import { DatabaseIcon, RocketIcon, Table2Icon } from 'lucide-react';

import { VariableIcon } from '@/components/icons/variable';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';

import { ProjectDashboardLayoutHeaderTab } from '.';

export function useProjectNavTabs() {
  const { checkAccess } = useAuthorization();

  const tabs: ProjectDashboardLayoutHeaderTab[] = [
    {
      to: authenticationSession.appendProjectRoutePrefix('/variables'),
      label: t('Project config'),
      icon: VariableIcon,
      hasPermission: checkAccess(Permission.READ_VARIABLE),
      show: true,
    },
    {
      to: authenticationSession.appendProjectRoutePrefix('/releases'),
      label: t('Releases and approvals'),
      icon: RocketIcon,
      hasPermission: checkAccess(Permission.READ_PROJECT_RELEASE),
      show: true,
    },
    {
      to: authenticationSession.appendProjectRoutePrefix('/mapping-tables'),
      label: t('Mapping tables'),
      icon: Table2Icon,
      hasPermission: checkAccess(Permission.READ_WORKFLOW),
      show: true,
    },
    {
      to: authenticationSession.appendProjectRoutePrefix('/data-stores'),
      label: t('Data stores'),
      icon: DatabaseIcon,
      hasPermission: checkAccess(Permission.READ_WORKFLOW),
      show: true,
    },
  ];

  return {
    tabs: tabs.filter((tab) => tab.show && tab.hasPermission),
  };
}

export function pathOf(to: string): string {
  return to.split('?')[0];
}
