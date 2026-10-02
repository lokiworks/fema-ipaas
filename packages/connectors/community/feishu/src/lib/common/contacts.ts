import { createHash } from 'node:crypto';

import { HttpMethod } from '@fema-ipaas/connector-common';

import { feishuCommon, type FeishuAuthValue } from './index';

export const feishuContacts = {
  provisionUser,
  updateUser,
  offboardUser,
  updateUserBody,
  offboardUserBody,
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

async function offboardUser({ auth, input }: OffboardUserParams): Promise<OffboardUserResult> {
  await feishuCommon.callApi<unknown>({
    auth,
    method: HttpMethod.DELETE,
    path: `/open-apis/contact/v3/users/${encodeURIComponent(input.openId)}`,
    queryParams: { user_id_type: 'open_id' },
    ...(input.receiverOpenId ? { body: offboardUserBody(input.receiverOpenId) } : {}),
  });
  return { offboarded: true, open_id: input.openId, resources_to: input.receiverOpenId ?? null };
}

function offboardUserBody(receiverOpenId: string): Record<string, string> {
  return {
    department_chat_acceptor_user_id: receiverOpenId,
    external_chat_acceptor_user_id: receiverOpenId,
    docs_acceptor_user_id: receiverOpenId,
    calendar_acceptor_user_id: receiverOpenId,
    application_acceptor_user_id: receiverOpenId,
    minutes_acceptor_user_id: receiverOpenId,
    survey_acceptor_user_id: receiverOpenId,
  };
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

export type OffboardUserInput = {
  openId: string;
  receiverOpenId?: string;
};

export type OffboardUserResult = {
  offboarded: boolean;
  open_id: string;
  resources_to: string | null;
};

type UpdateUserParams = {
  auth: FeishuAuthValue;
  input: UpdateUserInput;
};

type OffboardUserParams = {
  auth: FeishuAuthValue;
  input: OffboardUserInput;
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
