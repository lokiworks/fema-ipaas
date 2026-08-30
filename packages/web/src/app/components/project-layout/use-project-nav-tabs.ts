import { Permission } from '@fema-ipaas/core-utils';
import { ExecutionStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { HouseIcon } from 'lucide-react';

import { ConnectIcon } from '@/components/icons/connect';
import { HistoryIcon } from '@/components/icons/history';
import { VariableIcon } from '@/components/icons/variable';
import { WorkflowIcon } from '@/components/icons/workflow';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';

import { ProjectDashboardLayoutHeaderTab } from '.';

export function useProjectNavTabs() {
  const { checkAccess } = useAuthorization();

  const primaryTabs: ProjectDashboardLayoutHeaderTab[] = [
    {
      to: authenticationSession.appendProjectRoutePrefix('/home'),
      label: t('Home'),
      icon: HouseIcon,
      hasPermission: checkAccess(Permission.READ_RUN),
      show: true,
    },
    {
      to: authenticationSession.appendProjectRoutePrefix('/automations'),
      label: t('Workflows'),
      icon: WorkflowIcon,
      hasPermission: checkAccess(Permission.READ_WORKFLOW),
      show: true,
    },
  ];

  const secondaryTabs: ProjectDashboardLayoutHeaderTab[] = [
    {
      to: authenticationSession.appendProjectRoutePrefix('/runs'),
      label: t('Run Center'),
      icon: HistoryIcon,
      hasPermission: checkAccess(Permission.READ_RUN),
      show: true,
      children: [
        {
          to: authenticationSession.appendProjectRoutePrefix('/runs'),
          label: t('All runs'),
        },
        {
          to: `${authenticationSession.appendProjectRoutePrefix(
            '/runs',
          )}?status=${ExecutionStatus.FAILED}`,
          label: t('Failures'),
        },
      ],
    },
    {
      to: authenticationSession.appendProjectRoutePrefix('/connections'),
      label: t('Connections'),
      icon: ConnectIcon,
      hasPermission: checkAccess(Permission.READ_CONNECTION),
      show: true,
    },
    {
      to: authenticationSession.appendProjectRoutePrefix('/variables'),
      label: t('Resources'),
      icon: VariableIcon,
      hasPermission: checkAccess(Permission.READ_VARIABLE),
      show: true,
    },
  ];

  return {
    primaryTabs: primaryTabs.filter((tab) => tab.show && tab.hasPermission),
    secondaryTabs: secondaryTabs.filter((tab) => tab.show && tab.hasPermission),
  };
}

export function pathOf(to: string): string {
  return to.split('?')[0];
}
