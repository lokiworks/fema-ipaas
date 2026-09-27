import { Permission } from '@fema-ipaas/core-utils';
import { ExecutionStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ChartColumnIcon,
  HouseIcon,
  RocketIcon,
  ServerCogIcon,
  ShieldQuestionIcon,
  SirenIcon,
  Table2Icon,
} from 'lucide-react';

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
      to: authenticationSession.appendProjectRoutePrefix('/issues'),
      label: t('Issues'),
      icon: SirenIcon,
      hasPermission: checkAccess(Permission.READ_ISSUE),
      show: true,
    },
    {
      to: authenticationSession.appendProjectRoutePrefix('/agent-approvals'),
      label: t('Agent approvals'),
      icon: ShieldQuestionIcon,
      hasPermission: checkAccess(Permission.READ_RUN),
      show: true,
    },
    {
      to: authenticationSession.appendProjectRoutePrefix('/releases'),
      label: t('Environments and releases'),
      icon: RocketIcon,
      hasPermission: checkAccess(Permission.READ_PROJECT_RELEASE),
      show: true,
    },
    {
      to: authenticationSession.appendProjectRoutePrefix('/connections'),
      label: t('Connections'),
      icon: ConnectIcon,
      hasPermission: checkAccess(Permission.READ_CONNECTION),
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
      to: authenticationSession.appendProjectRoutePrefix('/mcp-services'),
      label: t('MCP services'),
      icon: ServerCogIcon,
      hasPermission: checkAccess(Permission.READ_MCP_SERVICE),
      show: true,
    },
    {
      to: authenticationSession.appendProjectRoutePrefix('/ai-usage'),
      label: t('AI usage'),
      icon: ChartColumnIcon,
      hasPermission: checkAccess(Permission.READ_PROJECT),
      show: true,
    },
    {
      to: authenticationSession.appendProjectRoutePrefix('/variables'),
      label: t('Variables'),
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
