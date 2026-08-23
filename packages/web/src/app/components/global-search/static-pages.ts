import { type ComponentType } from 'react';

import { BotIcon } from '@/components/icons/bot';
import { ChartLineIcon } from '@/components/icons/chart-line';
import { CompassIcon } from '@/components/icons/compass';
import { FileHeartIcon } from '@/components/icons/file-heart';
import { FileJson2Icon } from '@/components/icons/file-json2';
import { FrameIcon } from '@/components/icons/frame';
import { KeyRoundIcon } from '@/components/icons/key-round';
import { LayoutGridIcon } from '@/components/icons/layout-grid';
import { LogInIcon } from '@/components/icons/log-in';
import { MousePointerClickIcon } from '@/components/icons/mouse-pointer-click';
import { PaletteIcon } from '@/components/icons/palette';
import { PuzzleIcon } from '@/components/icons/puzzle';
import { ReceiptIcon } from '@/components/icons/receipt';
import { ServerIcon } from '@/components/icons/server';
import { Settings2Icon } from '@/components/icons/settings2';
import { ShieldIcon } from '@/components/icons/shield';
import { SquareDashedBottomCodeIcon } from '@/components/icons/square-dashed-bottom-code';
import { UnplugIcon } from '@/components/icons/unplug';
import { UsersIcon } from '@/components/icons/users';
import { WebhookIcon } from '@/components/icons/webhook';
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
  {
    id: 'page-impact',
    label: 'Impact',
    href: '/impact',
    icon: ChartLineIcon,
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
    id: 'page-tenant-ai',
    label: 'Tenant Admin — AI Providers',
    href: '/tenant/setup/ai',
    icon: BotIcon,
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
    id: 'page-tenant-connections',
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
    id: 'page-tenant-billing',
    label: 'Tenant Admin — Billing',
    href: '/tenant/setup/billing',
    icon: ReceiptIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-embedding',
    label: 'Tenant Admin — Embedding',
    href: '/tenant/security/embed',
    icon: FrameIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-audit-logs',
    label: 'Tenant Admin — Audit Logs',
    href: '/tenant/security/audit-logs',
    icon: SquareDashedBottomCodeIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-sso',
    label: 'Tenant Admin — Single Sign On',
    href: '/tenant/security/sso',
    icon: LogInIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-workspace-roles',
    label: 'Tenant Admin — Workspace Roles',
    href: '/tenant/security/workspace-roles',
    icon: Settings2Icon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-api-keys',
    label: 'Tenant Admin — API Keys',
    href: '/tenant/security/api-keys',
    icon: FileJson2Icon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-secret-managers',
    label: 'Tenant Admin — Secret Managers',
    href: '/tenant/security/secret-managers',
    icon: KeyRoundIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-workers',
    label: 'Tenant Admin — Workers',
    href: '/tenant/infrastructure/workers',
    icon: ServerIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-health',
    label: 'Tenant Admin — Health',
    href: '/tenant/infrastructure/health',
    icon: FileHeartIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-triggers',
    label: 'Tenant Admin — Triggers',
    href: '/tenant/infrastructure/triggers',
    icon: MousePointerClickIcon,
    requiresTenantAdmin: true,
  },
  {
    id: 'page-tenant-event-streaming',
    label: 'Tenant Admin — Event Streaming',
    href: '/tenant/infrastructure/event-destinations',
    icon: WebhookIcon,
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
