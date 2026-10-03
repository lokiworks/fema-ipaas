import { createHash } from 'node:crypto';

import { HttpMethod } from '@fema-ipaas/connector-common';

import { feishuCommon, type FeishuAuthValue } from './index';

export const feishuContacts = {
  provisionUser,
  updateUser,
  setUserSuspended,
  getUser,
  updateUserBody,
  normalizeMobile,
};

async function updateUser({ auth, input }: UpdateUserParams): Promise<UpdateUserResult> {
  const body = updateUserBody(input);
  if (Object.keys(body).length === 0) {
    return { updated: false, open_id: input.openId, changed: [] };
  }
  await feishuCommon.callApi<unknown>({
    auth,
    method: HttpMethod.PATCH,
    path: `/open-apis/contact/v3/users/${encodeURIComponent(input.openId)}`,
    queryParams: {
      user_id_type: 'open_id',
      ...(input.departmentId ? { department_id_type: departmentIdType(input.departmentId) } : {}),
    },
    body,
  });
  return { updated: true, open_id: input.openId, changed: Object.keys(body) };
}

function updateUserBody(input: UpdateUserInput): Record<string, unknown> {
  return {
    ...(input.name ? { name: input.name } : {}),
    ...(input.departmentId ? { department_ids: [input.departmentId] } : {}),
    ...(input.leaderOpenId ? { leader_user_id: input.leaderOpenId } : {}),
    ...(input.jobTitle ? { job_title: input.jobTitle } : {}),
  };
}

async function getUser({ auth, input }: GetUserParams): Promise<GetUserResult> {
  const data = await feishuCommon.callApi<GetUserResponse>({
    auth,
    method: HttpMethod.GET,
    path: `/open-apis/contact/v3/users/${encodeURIComponent(input.openId)}`,
    queryParams: {
      user_id_type: 'open_id',
      department_id_type: input.departmentId ? departmentIdType(input.departmentId) : 'open_department_id',
    },
  });
  const user = data.user ?? {};
  return {
    open_id: user.open_id ?? input.openId,
    name: user.name ?? null,
    department_ids: user.department_ids ?? [],
    leader_open_id: user.leader_user_id ?? null,
    job_title: user.job_title ?? null,
    is_frozen: user.status?.is_frozen === true,
    is_resigned: user.status?.is_resigned === true,
  };
}

async function setUserSuspended({ auth, input }: SetUserSuspendedParams): Promise<SetUserSuspendedResult> {
  await feishuCommon.callApi<unknown>({
    auth,
    method: HttpMethod.PATCH,
    path: `/open-apis/contact/v3/users/${encodeURIComponent(input.openId)}`,
    queryParams: { user_id_type: 'open_id' },
    body: { status: { is_frozen: input.suspended } },
  });
  return { open_id: input.openId, suspended: input.suspended };
}

async function provisionUser({ auth, input }: ProvisionUserParams): Promise<ProvisionUserResult> {
  const mobile = normalizeMobile(input.mobile);
  const existing = await findExistingUser({ auth, mobile, email: input.email });
  if (existing) {
    return { created: false, open_id: existing, mobile };
  }
  const data = await feishuCommon.callApi<CreateUserResponse>({
    auth,
    method: HttpMethod.POST,
    path: '/open-apis/contact/v3/users',
    queryParams: {
      user_id_type: 'open_id',
      department_id_type: departmentIdType(input.departmentId),
      client_token: clientTokenFor({ appId: auth.props.appId, mobile }),
    },
    body: {
      name: input.name,
      mobile,
      department_ids: [input.departmentId],
      employee_type: input.employeeType,
      ...(input.email ? { email: input.email } : {}),
      ...(input.employeeNo ? { employee_no: input.employeeNo } : {}),
      ...(input.jobTitle ? { job_title: input.jobTitle } : {}),
    },
  });
  return {
    created: true,
    open_id: data.user.open_id,
    mobile,
    user_id: data.user.user_id ?? null,
    union_id: data.user.union_id ?? null,
  };
}

function normalizeMobile(mobile: string): string {
  const compact = mobile.replace(/[\s-]/g, '');
  return MAINLAND_MOBILE.test(compact) ? `+86${compact}` : compact;
}

async function findExistingUser({ auth, mobile, email }: FindExistingUserParams): Promise<string | null> {
  const data = await feishuCommon.callApi<BatchGetIdResponse>({
    auth,
    method: HttpMethod.POST,
    path: '/open-apis/contact/v3/users/batch_get_id',
    queryParams: { user_id_type: 'open_id' },
    body: { mobiles: [mobile], ...(email ? { emails: [email] } : {}) },
  });
  return (data.user_list ?? []).find((user) => user.user_id)?.user_id ?? null;
}

function departmentIdType(departmentId: string): string {
  return departmentId.startsWith('od-') ? 'open_department_id' : 'department_id';
}

function clientTokenFor({ appId, mobile }: { appId: string; mobile: string }): string {
  const hex = createHash('sha256').update(`${appId}:${mobile}`).digest('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

const MAINLAND_MOBILE = /^1\d{10}$/;

export type ProvisionUserInput = {
  name: string;
  mobile: string;
  departmentId: string;
  employeeType: number;
  email?: string;
  employeeNo?: string;
  jobTitle?: string;
};

export type UpdateUserInput = {
  openId: string;
  name?: string;
  departmentId?: string;
  leaderOpenId?: string;
  jobTitle?: string;
};

export type UpdateUserResult = {
  updated: boolean;
  open_id: string;
  changed: string[];
};

export type SetUserSuspendedInput = {
  openId: string;
  suspended: boolean;
};

export type GetUserInput = {
  openId: string;
  departmentId?: string | undefined;
};

export type GetUserResult = {
  open_id: string;
  name: string | null;
  department_ids: string[];
  leader_open_id: string | null;
  job_title: string | null;
  is_frozen: boolean;
  is_resigned: boolean;
};

type GetUserParams = {
  auth: FeishuAuthValue;
  input: GetUserInput;
};

type GetUserResponse = {
  user?: {
    open_id?: string;
    name?: string;
    department_ids?: string[];
    leader_user_id?: string;
    job_title?: string;
    status?: { is_frozen?: boolean; is_resigned?: boolean };
  };
};

export type SetUserSuspendedResult = {
  open_id: string;
  suspended: boolean;
};

type UpdateUserParams = {
  auth: FeishuAuthValue;
  input: UpdateUserInput;
};

type SetUserSuspendedParams = {
  auth: FeishuAuthValue;
  input: SetUserSuspendedInput;
};

export type ProvisionUserResult = {
  created: boolean;
  open_id: string;
  mobile: string;
  user_id?: string | null;
  union_id?: string | null;
};

type ProvisionUserParams = {
  auth: FeishuAuthValue;
  input: ProvisionUserInput;
};

type FindExistingUserParams = {
  auth: FeishuAuthValue;
  mobile: string;
  email?: string;
};

type BatchGetIdResponse = {
  user_list?: { user_id?: string; email?: string; mobile?: string }[];
};

type CreateUserResponse = {
  user: { open_id: string; user_id?: string; union_id?: string };
};
