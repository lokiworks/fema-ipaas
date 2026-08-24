import { TerminalIcon } from 'lucide-react';
import { type ComponentType } from 'react';

import { CompassIcon } from '@/components/icons/compass';
import { FileHeartIcon } from '@/components/icons/file-heart';
import { FileJson2Icon } from '@/components/icons/file-json2';
import { LayoutGridIcon } from '@/components/icons/layout-grid';
import { LogInIcon } from '@/components/icons/log-in';
import { MousePointerClickIcon } from '@/components/icons/mouse-pointer-click';
import { PaletteIcon } from '@/components/icons/palette';
import { PuzzleIcon } from '@/components/icons/puzzle';
import { ServerIcon } from '@/components/icons/server';
import { ShieldIcon } from '@/components/icons/shield';
import { SquareDashedBottomCodeIcon } from '@/components/icons/square-dashed-bottom-code';
import { UnplugIcon } from '@/components/icons/unplug';
import { UsersIcon } from '@/components/icons/users';
import { WorkflowIcon } from '@/components/icons/workflow';

export type StaticPage = {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  requiresTenantAdmin?: boolean;
};

export const STATIC_PAGES: StaticPage[] = [
  {
    id: 'page-automations',
    label: 'Automations',
    href: '/automations',
    icon: WorkflowIcon,
  },
  {
    id: 'page-explore',
    label: 'Explore Templates',
    href: '/templates',
    icon: CompassIcon,
  },
  // Tenant Admin pages
  {
    id: 'page-tenant-workspaces',
    label: 'Tenant Admin — Workspaces',
    href: '/tenant/workspaces',
    icon: LayoutGridIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-users',
    label: 'Tenant Admin — Users',
    href: '/tenant/users',
    icon: UsersIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-connections',
    label: 'Tenant Admin — Connections',
    href: '/tenant/connections',
    icon: UnplugIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-connector-marketplace',
    label: 'Tenant Admin — Connector Marketplace',
    href: '/tenant/connectors',
    icon: PuzzleIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-connector-development',
    label: 'Tenant Admin — Connector Development',
    href: '/tenant/connectors/development',
    icon: TerminalIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-connector-builder',
    label: 'Tenant Admin — Build a Connector',
    href: '/tenant/connectors/builder',
    icon: MousePointerClickIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-connector-openapi',
    label: 'Tenant Admin — Import from OpenAPI',
    href: '/tenant/connectors/openapi',
    icon: FileJson2Icon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-branding',
    label: 'Tenant Admin — General',
    href: '/tenant/setup/general',
    icon: PaletteIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-global-connections',
    label: 'Tenant Admin — Global Connections',
    href: '/tenant/setup/connections',
    icon: UnplugIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-connectors',
    label: 'Tenant Admin — Connectors',
    href: '/tenant/setup/connectors',
    icon: PuzzleIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-templates',
    label: 'Tenant Admin — Templates',
    href: '/tenant/setup/templates',
    icon: LayoutGridIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-audit-log',
    label: 'Tenant Admin — Audit Log',
    href: '/tenant/audit',
    icon: SquareDashedBottomCodeIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-authentication',
    label: 'Tenant Admin — Authentication',
    href: '/tenant/security/authentication',
    icon: LogInIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-workers',
    label: 'Tenant Admin — Workers',
    href: '/tenant/infra/workers',
    icon: ServerIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-health',
    label: 'Tenant Admin — Health',
    href: '/tenant/infra/health',
    icon: FileHeartIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-triggers',
    label: 'Tenant Admin — Triggers',
    href: '/tenant/infra/triggers',
    icon: MousePointerClickIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-admin',
    label: 'Tenant Admin',
    href: '/tenant/workspaces',
    icon: ShieldIcon,
    requiresTenantAdmin: true,
  },
];
