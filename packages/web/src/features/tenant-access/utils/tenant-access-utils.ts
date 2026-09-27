import {
  LoginMethod,
  ModuleAccessRequestStatus,
  OwnedResourceType,
  TENANT_ACCESS_LIMITS,
  TenantMemberStatus,
  TenantModule,
  TenantRole,
  WORKER_NODE_LIMITS,
  WorkerNodeStatus,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

function moduleLabel(module: TenantModule): string {
  switch (module) {
    case TenantModule.BUSINESS_INTEGRATION:
      return t('Business integration');
    case TenantModule.CONNECTOR_DEVELOPMENT:
      return t('Connector development');
    case TenantModule.MCP_SERVICES:
      return t('MCP services');
    case TenantModule.PLATFORM_ADMIN:
      return t('Platform administration');
  }
}

function roleLabel({
  tenantRole,
  isOwner,
}: {
  tenantRole: TenantRole;
  isOwner: boolean;
}): string {
  if (isOwner) {
    return t('Owner');
  }
  switch (tenantRole) {
    case TenantRole.ADMIN:
      return t('Admin');
    case TenantRole.OPERATOR:
      return t('Operator');
    case TenantRole.MEMBER:
      return t('Member');
  }
}

function memberStatusLabel(status: TenantMemberStatus): string {
  switch (status) {
    case TenantMemberStatus.ACTIVE:
      return t('Active');
    case TenantMemberStatus.PENDING:
      return t('Pending activation');
    case TenantMemberStatus.DISABLED:
      return t('Disabled');
  }
}

function requestStatusLabel(status: ModuleAccessRequestStatus): string {
  switch (status) {
    case ModuleAccessRequestStatus.PENDING:
      return t('Pending review');
    case ModuleAccessRequestStatus.APPROVED:
      return t('Approved');
    case ModuleAccessRequestStatus.REJECTED:
      return t('Rejected');
  }
}

function resourceTypeLabel(type: OwnedResourceType): string {
  switch (type) {
    case OwnedResourceType.WORKFLOW:
      return t('Workflow');
    case OwnedResourceType.CONNECTION:
      return t('Connection');
    case OwnedResourceType.MCP_SERVICE:
      return t('MCP service');
    case OwnedResourceType.DATA_STORE:
      return t('Data store');
    case OwnedResourceType.PROJECT:
      return t('Project');
  }
}

function loginMethodLabel(method: LoginMethod): string {
  switch (method) {
    case LoginMethod.EMAIL_PASSWORD:
      return t('Email and password');
    case LoginMethod.OIDC:
      return 'OIDC';
    case LoginMethod.SAML:
      return 'SAML 2.0';
    case LoginMethod.FEISHU:
      return t('Feishu');
    case LoginMethod.WECOM:
      return t('WeCom');
    case LoginMethod.DINGTALK:
      return t('DingTalk');
  }
}

function workerStatusLabel(status: WorkerNodeStatus): string {
  switch (status) {
    case WorkerNodeStatus.ONLINE:
      return t('Online');
    case WorkerNodeStatus.DRAINING:
      return t('Draining');
    case WorkerNodeStatus.OFFLINE:
      return t('Offline');
  }
}

function parseEmails(text: string): string[] {
  const parts = text
    .split(/[\s,，;；、]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  return [...new Set(parts)];
}

function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  return at < 0 ? null : email.slice(at + 1).toLowerCase();
}

function isExternalEmail({
  email,
  homeDomains,
}: {
  email: string;
  homeDomains: string[];
}): boolean {
  const domain = emailDomain(email);
  return homeDomains.length > 0 && domain !== null && !homeDomains.includes(domain);
}

function parseLabels(text: string): string[] {
  const labels = text
    .split(/[\s,，、]+/)
    .map((label) => label.trim().toLowerCase())
    .filter((label) => label.length > 0);
  return [...new Set(labels)];
}

function labelsError(labels: string[]): string | null {
  if (labels.length > WORKER_NODE_LIMITS.maxLabels) {
    return 'atMostFiveLabels';
  }
  return labels.every((label) => LABEL_PATTERN.test(label))
    ? null
    : 'invalidWorkerLabel';
}

function concurrencyError(value: string): string | null {
  const parsed = Number(value);
  const valid =
    /^\d+$/.test(value) &&
    parsed >= WORKER_NODE_LIMITS.minConcurrency &&
    parsed <= WORKER_NODE_LIMITS.maxConcurrency;
  return valid ? null : 'workerConcurrencyRange';
}

function workerDockerCommand({
  name,
  frontendUrl,
  concurrency,
  labels,
  version,
}: {
  name: string;
  frontendUrl: string;
  concurrency: string;
  labels: string[];
  version: string;
}): string {
  const lines = [
    `docker run -d --name ${name || 'fema-worker'} --restart unless-stopped \\`,
    `  -e FEMA_CONTAINER_TYPE=WORKER \\`,
    `  -e FEMA_FRONTEND_URL=${frontendUrl} \\`,
    `  -e FEMA_WORKER_TOKEN=<worker-token> \\`,
    `  -e FEMA_WORKER_CONCURRENCY=${concurrency} \\`,
    ...(labels.length > 0 ? [`  -e FEMA_WORKER_LABELS=${labels.join(',')} \\`] : []),
    `  -e FEMA_EXECUTION_MODE=SANDBOX_CODE_ONLY \\`,
    `  ghcr.io/lokiworks/fema-ipaas:${version}`,
  ];
  return lines.join('\n');
}

function toCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function passwordLengthError(value: number): string | null {
  return Number.isInteger(value) &&
    value >= TENANT_ACCESS_LIMITS.passwordMinLengthFloor &&
    value <= TENANT_ACCESS_LIMITS.passwordMinLengthCeiling
    ? null
    : 'passwordMinLengthRange';
}

function memberDisplayName(member: {
  firstName: string;
  lastName: string;
  email: string;
}): string {
  const name = `${member.firstName} ${member.lastName}`.trim();
  return name.length > 0 ? name : member.email;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LABEL_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const tenantAccessUtils = {
  moduleLabel,
  roleLabel,
  memberStatusLabel,
  requestStatusLabel,
  resourceTypeLabel,
  loginMethodLabel,
  workerStatusLabel,
  parseEmails,
  isEmail,
  isExternalEmail,
  parseLabels,
  labelsError,
  concurrencyError,
  workerDockerCommand,
  toCsv,
  passwordLengthError,
  memberDisplayName,
};
