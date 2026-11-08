import {
  CaptchaProvider,
  InstanceRole,
  OperatorTenantSummary,
  PlatformClientKind,
  PlatformLoginAppKind,
  PlatformScope,
  SmsProviderKind,
  TenantLimitsUpdate,
  TenantOwnerInput,
  TenantStatus,
  UserWithMetaInformation,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { tenantAccessUtils } from '@/features/tenant-access/utils/tenant-access-utils';

function isOperator(
  user: Pick<UserWithMetaInformation, 'instanceRole'> | null,
) {
  return user?.instanceRole === InstanceRole.OPERATOR;
}

function tenantStatusLabel(status: TenantStatus): string {
  return status === TenantStatus.ACTIVE ? t('Active') : t('Suspended');
}

function limitLabel(limit: number | null | undefined): string {
  return limit === null || limit === undefined ? t('Unlimited') : String(limit);
}

function usageRatio({
  used,
  limit,
}: {
  used: number;
  limit: number | null | undefined;
}): number | null {
  if (limit === null || limit === undefined) {
    return null;
  }
  if (limit === 0) {
    return used > 0 ? 1 : 0;
  }
  return Math.min(used / limit, 1);
}

function usageTone({
  used,
  limit,
}: {
  used: number;
  limit: number | null | undefined;
}): 'normal' | 'warning' | 'danger' {
  const ratio = usageRatio({ used, limit });
  if (ratio === null || ratio < 0.8) {
    return 'normal';
  }
  return ratio >= 1 ? 'danger' : 'warning';
}

function parseLimitInput(
  text: string,
): { ok: true; value: number | null } | { ok: false } {
  const value = text.trim();
  if (value.length === 0) {
    return { ok: true, value: null };
  }
  if (!/^\d{1,9}$/.test(value)) {
    return { ok: false };
  }
  return { ok: true, value: Number(value) };
}

function limitInputOf(limit: number | null | undefined): string {
  return limit === null || limit === undefined ? '' : String(limit);
}

function buildLimitsUpdate(
  inputs: LimitInputs,
): { ok: true; limits: TenantLimitsUpdate } | { ok: false; field: LimitField } {
  const users = parseLimitInput(inputs.usersLimit);
  const projects = parseLimitInput(inputs.projectsLimit);
  const workflows = parseLimitInput(inputs.activeWorkflowsLimit);
  const concurrent = parseLimitInput(inputs.concurrentExecutionsLimit);
  if (!users.ok) {
    return { ok: false, field: 'usersLimit' };
  }
  if (!projects.ok) {
    return { ok: false, field: 'projectsLimit' };
  }
  if (!workflows.ok) {
    return { ok: false, field: 'activeWorkflowsLimit' };
  }
  if (!concurrent.ok) {
    return { ok: false, field: 'concurrentExecutionsLimit' };
  }
  const workerGroupId = inputs.workerGroupId.trim();
  return {
    ok: true,
    limits: {
      usersLimit: users.value,
      projectsLimit: projects.value,
      activeWorkflowsLimit: workflows.value,
      concurrentExecutionsLimit: concurrent.value,
      workerGroupId: workerGroupId.length === 0 ? null : workerGroupId,
    },
  };
}

function buildOwnerInput({
  contact,
  firstName,
  lastName,
}: {
  contact: string;
  firstName: string;
  lastName: string;
}): TenantOwnerInput | null {
  const value = contact.trim();
  const names = {
    ...(firstName.trim().length > 0 ? { firstName: firstName.trim() } : {}),
    ...(lastName.trim().length > 0 ? { lastName: lastName.trim() } : {}),
  };
  if (tenantAccessUtils.isEmail(value)) {
    return { email: value.toLowerCase(), ...names };
  }
  if (tenantAccessUtils.isPhone(value)) {
    return { phone: tenantAccessUtils.normalizePhone(value), ...names };
  }
  return null;
}

function slugFromName(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return ascii.length >= 3 ? ascii : '';
}

function parseSubjects(text: string): string[] {
  const parts = text
    .split(/[\s,，;；]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return [...new Set(parts)];
}

function scopeLabel(scope: PlatformScope): string {
  switch (scope) {
    case PlatformScope.TENANT_PROVISION:
      return t('Create and update tenants');
    case PlatformScope.TENANT_MEMBERS:
      return t('Manage tenant members');
    case PlatformScope.USAGE_READ:
      return t('Read usage');
  }
}

function clientKindLabel(kind: PlatformClientKind): string {
  return kind === PlatformClientKind.API_KEY
    ? t('API key')
    : t('Trusted issuer');
}

function captchaLabel(provider: CaptchaProvider): string {
  return provider === CaptchaProvider.BUILTIN
    ? t('Built-in challenge')
    : t('Cloudflare Turnstile');
}

function loginAppLabel(kind: PlatformLoginAppKind): string {
  switch (kind) {
    case 'FEISHU':
      return t('Feishu');
    case 'WECOM':
      return t('WeCom');
    case 'DINGTALK':
      return t('DingTalk');
  }
}

function smsProviderLabel(provider: 'ALIYUN' | 'TENCENT'): string {
  return provider === 'ALIYUN'
    ? t('Alibaba Cloud SMS')
    : t('Tencent Cloud SMS');
}

function platformClientRequest({
  kind,
  name,
  issuer,
  subjects,
  scopes,
}: {
  kind: PlatformClientKind;
  name: string;
  issuer: string;
  subjects: string;
  scopes: PlatformScope[];
}) {
  if (kind === PlatformClientKind.API_KEY) {
    return { kind, name, scopes };
  }
  return {
    kind,
    name,
    issuer,
    allowedSubjects: parseSubjects(subjects),
    scopes,
  };
}

function emptyToNull(value: string): string | null {
  return value.trim().length === 0 ? null : value.trim();
}

function smsRequest(values: {
  provider: SmsProviderKind;
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
  sdkAppId: string;
  region: string;
}) {
  return {
    provider: values.provider,
    accessKeyId: values.accessKeyId,
    ...(values.accessKeySecret.length > 0
      ? { accessKeySecret: values.accessKeySecret }
      : {}),
    signName: values.signName,
    templateCode: values.templateCode,
    sdkAppId:
      values.provider === 'TENCENT' ? emptyToNull(values.sdkAppId) : null,
    region: emptyToNull(values.region),
  };
}

function loginAppRequest(values: {
  enabled: boolean;
  appId: string;
  appSecret: string;
  region: string;
  allowSelfSignup: boolean;
}) {
  return {
    enabled: values.enabled,
    appId: values.appId,
    ...(values.appSecret.length > 0 ? { appSecret: values.appSecret } : {}),
    region: emptyToNull(values.region),
    allowSelfSignup: values.allowSelfSignup,
  };
}

function limitsInputsOf(
  tenant: Pick<
    OperatorTenantSummary,
    | 'usersLimit'
    | 'projectsLimit'
    | 'activeWorkflowsLimit'
    | 'concurrentExecutionsLimit'
    | 'workerGroupId'
  >,
): LimitInputs {
  return {
    usersLimit: limitInputOf(tenant.usersLimit),
    projectsLimit: limitInputOf(tenant.projectsLimit),
    activeWorkflowsLimit: limitInputOf(tenant.activeWorkflowsLimit),
    concurrentExecutionsLimit: limitInputOf(tenant.concurrentExecutionsLimit),
    workerGroupId: tenant.workerGroupId ?? '',
  };
}

export const operatorUtils = {
  isOperator,
  tenantStatusLabel,
  limitLabel,
  usageRatio,
  usageTone,
  parseLimitInput,
  limitInputOf,
  buildLimitsUpdate,
  buildOwnerInput,
  slugFromName,
  parseSubjects,
  scopeLabel,
  clientKindLabel,
  captchaLabel,
  loginAppLabel,
  smsProviderLabel,
  platformClientRequest,
  smsRequest,
  loginAppRequest,
  limitsInputsOf,
  emptyToNull,
};

export type LimitField =
  | 'usersLimit'
  | 'projectsLimit'
  | 'activeWorkflowsLimit'
  | 'concurrentExecutionsLimit';

export type LimitInputs = {
  usersLimit: string;
  projectsLimit: string;
  activeWorkflowsLimit: string;
  concurrentExecutionsLimit: string;
  workerGroupId: string;
};
