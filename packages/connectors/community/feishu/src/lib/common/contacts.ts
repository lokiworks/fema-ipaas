import { createHash } from 'node:crypto';

import { HttpMethod } from '@fema-ipaas/connector-common';

import { feishuCommon, type FeishuAuthValue } from './index';

export const feishuContacts = {
  provisionUser,
  normalizeMobile,
};

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
