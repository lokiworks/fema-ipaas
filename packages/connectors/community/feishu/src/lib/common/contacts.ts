import { HttpMethod } from '@fema-ipaas/connector-common';
import { tryCatch } from '@fema-ipaas/connector-sdk';

import { feishuCommon, type FeishuAuthValue } from './index';
import { feishuIdempotency } from './idempotency';

export const feishuContacts = {
  provisionUser,
  updateUser,
  setUserSuspended,
  getUser,
  lookupUser,
  listDepartmentUsers,
  listDepartments,
  updateUserBody,
  createUserBody,
  normalizeMobile,
  mobileCandidates,
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
  return toUserResult({ user: data.user ?? {}, fallbackOpenId: input.openId });
}

async function setUserSuspended({ auth, input }: SetUserSuspendedParams): Promise<SetUserSuspendedResult> {
  await feishuCommon.callApi<unknown>({
    auth,
    method: HttpMethod.PATCH,
    path: `/open-apis/contact/v3/users/${encodeURIComponent(input.openId)}`,
    queryParams: { user_id_type: 'open_id' },
    body: { is_frozen: input.suspended },
  });
  const { data: readBack } = await tryCatch(() => getUser({ auth, input: { openId: input.openId } }));
  return {
    open_id: input.openId,
    suspended: input.suspended,
    is_frozen: readBack ? readBack.is_frozen : null,
    confirmed: readBack ? readBack.is_frozen === input.suspended : null,
  };
}

async function provisionUser({ auth, input }: ProvisionUserParams): Promise<ProvisionUserResult> {
  const mobile = normalizeMobile(input.mobile);
  const existing = await lookupUser({ auth, mobile, email: input.email, includeResigned: false });
  if (existing) {
    return reuseExisting({ existing, mobile });
  }
  const body = createUserBody({ ...input, mobile });
  const { data, error } = await tryCatch(() =>
    feishuCommon.callApi<CreateUserResponse>({
      auth,
      method: HttpMethod.POST,
      path: '/open-apis/contact/v3/users',
      queryParams: {
        user_id_type: 'open_id',
        department_id_type: departmentIdType(input.departmentId),
        client_token: feishuIdempotency.uuidFrom({ seed: `${auth.props.appId}:${departmentIdType(input.departmentId)}:${JSON.stringify(body)}` }),
      },
      body,
    }),
  );
  if (error) {
    return recoverFromDuplicate({ auth, error, mobile, email: input.email });
  }
  return {
    created: true,
    open_id: data.user.open_id,
    mobile,
    user_id: data.user.user_id ?? null,
    union_id: data.user.union_id ?? null,
  };
}

function createUserBody(input: ProvisionUserInput): Record<string, unknown> {
  return {
    name: input.name,
    mobile: input.mobile,
    department_ids: [input.departmentId],
    employee_type: input.employeeType,
    ...(input.email ? { email: input.email } : {}),
    ...(input.employeeNo ? { employee_no: input.employeeNo } : {}),
    ...(input.jobTitle ? { job_title: input.jobTitle } : {}),
  };
}

async function recoverFromDuplicate({ auth, error, mobile, email }: RecoverParams): Promise<ProvisionUserResult> {
  const code = feishuCommon.errorCodeOf(error);
  if (code === undefined || !ALREADY_EXISTS_CODES.includes(code)) {
    throw error;
  }
  const active = await lookupUser({ auth, mobile, email, includeResigned: false });
  if (active) {
    return reuseExisting({ existing: active, mobile });
  }
  const resigned = await lookupUser({ auth, mobile, email, includeResigned: true });
  if (resigned?.isResigned) {
    return reuseExisting({ existing: resigned, mobile });
  }
  throw error;
}

function reuseExisting({ existing, mobile }: { existing: LookupResult; mobile: string }): ProvisionUserResult {
  if (existing.isResigned) {
    throw new Error(feishuCommon.describeError(RESIGNED_CODE, 'the Feishu account holding this mobile or email has resigned'));
  }
  return {
    created: false,
    open_id: existing.openId,
    mobile,
    matched_by: existing.matchedBy,
    is_frozen: existing.isFrozen,
  };
}

async function lookupUser({ auth, mobile, email, includeResigned }: LookupUserParams): Promise<LookupResult | null> {
  const mobiles = mobile ? mobileCandidates({ mobile }) : [];
  const emails = email ? [email] : [];
  if (mobiles.length === 0 && emails.length === 0) {
    return null;
  }
  const data = await feishuCommon.callApi<BatchGetIdResponse>({
    auth,
    method: HttpMethod.POST,
    path: '/open-apis/contact/v3/users/batch_get_id',
    queryParams: { user_id_type: 'open_id' },
    body: {
      ...(mobiles.length > 0 ? { mobiles } : {}),
      ...(emails.length > 0 ? { emails } : {}),
      include_resigned: includeResigned === true,
    },
  });
  const entries = data.user_list ?? [];
  const byMobile = entries.find((entry) => entry.user_id && entry.mobile !== undefined);
  const byEmail = entries.find((entry) => entry.user_id && entry.email !== undefined);
  const match = byMobile ?? byEmail;
  if (!match?.user_id) {
    return null;
  }
  return {
    openId: match.user_id,
    matchedBy: byMobile ? 'mobile' : 'email',
    isFrozen: match.status ? match.status.is_frozen === true : null,
    isResigned: match.status?.is_resigned === true,
    email: match.email ?? null,
    mobile: match.mobile ?? null,
  };
}

async function listDepartmentUsers({ auth, input }: ListDepartmentUsersParams): Promise<ListedUser[]> {
  const departments = input.includeSubDepartments
    ? [input.departmentId, ...(await listDepartments({ auth, input: { parentDepartmentId: input.departmentId, includeAllLevels: true, maxItems: MAX_DEPARTMENTS } })).map((department) => department.open_department_id)]
    : [input.departmentId];
  const seen = new Set<string>();
  const users: ListedUser[] = [];
  for (const departmentId of departments) {
    if (users.length >= input.maxItems) {
      break;
    }
    const items = await feishuCommon.collectPages<UserRecord>({
      auth,
      path: '/open-apis/contact/v3/users/find_by_department',
      queryParams: {
        user_id_type: 'open_id',
        department_id_type: departmentIdType(departmentId),
        department_id: departmentId,
      },
      pageSize: USER_PAGE_SIZE,
      maxItems: input.maxItems - users.length,
    });
    items.forEach((item) => {
      const openId = item.open_id;
      if (openId && !seen.has(openId)) {
        seen.add(openId);
        users.push(toListedUser({ user: item }));
      }
    });
  }
  return users;
}

async function listDepartments({ auth, input }: ListDepartmentsParams): Promise<ListedDepartment[]> {
  const items = await feishuCommon.collectPages<DepartmentRecord>({
    auth,
    path: `/open-apis/contact/v3/departments/${encodeURIComponent(input.parentDepartmentId)}/children`,
    queryParams: {
      department_id_type: departmentIdType(input.parentDepartmentId),
      fetch_child: String(input.includeAllLevels),
    },
    pageSize: DEPARTMENT_PAGE_SIZE,
    maxItems: input.maxItems,
  });
  return items.map((item) => ({
    open_department_id: item.open_department_id ?? item.department_id ?? '',
    department_id: item.department_id ?? null,
    name: item.name ?? null,
    parent_department_id: item.parent_department_id ?? null,
    member_count: item.member_count ?? null,
    is_deleted: item.status?.is_deleted === true,
  }));
}

function toUserResult({ user, fallbackOpenId }: { user: UserRecord; fallbackOpenId: string }): GetUserResult {
  return {
    open_id: user.open_id ?? fallbackOpenId,
    user_id: user.user_id ?? null,
    name: user.name ?? null,
    email: user.email ?? null,
    mobile: user.mobile ?? null,
    employee_no: user.employee_no ?? null,
    department_ids: user.department_ids ?? [],
    leader_open_id: user.leader_user_id ?? null,
    job_title: user.job_title ?? null,
    is_frozen: user.status?.is_frozen === true,
    is_resigned: user.status?.is_resigned === true,
  };
}

function toListedUser({ user }: { user: UserRecord }): ListedUser {
  return {
    ...toUserResult({ user, fallbackOpenId: user.open_id ?? '' }),
    is_activated: user.status?.is_activated === true,
  };
}

function normalizeMobile(mobile: string): string {
  const compact = mobile.replace(/[\s-]/g, '');
  return MAINLAND_MOBILE.test(compact) ? `+86${compact}` : compact;
}

function mobileCandidates({ mobile }: { mobile: string }): string[] {
  const normalized = normalizeMobile(mobile);
  const bare = normalized.startsWith(MAINLAND_PREFIX) ? normalized.slice(MAINLAND_PREFIX.length) : null;
  return bare && MAINLAND_MOBILE.test(bare) ? [bare, normalized] : [normalized];
}

function departmentIdType(departmentId: string): string {
  return departmentId.startsWith('od-') ? 'open_department_id' : 'department_id';
}

const MAINLAND_MOBILE = /^1\d{10}$/;

const MAINLAND_PREFIX = '+86';

const ALREADY_EXISTS_CODES = [41001, 41002, 41053];

const RESIGNED_CODE = 42006;

const USER_PAGE_SIZE = 50;

const DEPARTMENT_PAGE_SIZE = 50;

const MAX_DEPARTMENTS = 5000;

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
  user_id: string | null;
  name: string | null;
  email: string | null;
  mobile: string | null;
  employee_no: string | null;
  department_ids: string[];
  leader_open_id: string | null;
  job_title: string | null;
  is_frozen: boolean;
  is_resigned: boolean;
};

export type ListedUser = GetUserResult & { is_activated: boolean };

export type ListedDepartment = {
  open_department_id: string;
  department_id: string | null;
  name: string | null;
  parent_department_id: string | null;
  member_count: number | null;
  is_deleted: boolean;
};

export type SetUserSuspendedResult = {
  open_id: string;
  suspended: boolean;
  is_frozen: boolean | null;
  confirmed: boolean | null;
};

export type ProvisionUserResult = {
  created: boolean;
  open_id: string;
  mobile: string;
  matched_by?: 'mobile' | 'email';
  is_frozen?: boolean | null;
  user_id?: string | null;
  union_id?: string | null;
};

export type LookupResult = {
  openId: string;
  matchedBy: 'mobile' | 'email';
  isFrozen: boolean | null;
  isResigned: boolean;
  email: string | null;
  mobile: string | null;
};

type UserRecord = {
  open_id?: string;
  user_id?: string;
  name?: string;
  email?: string;
  mobile?: string;
  employee_no?: string;
  department_ids?: string[];
  leader_user_id?: string;
  job_title?: string;
  status?: { is_frozen?: boolean; is_resigned?: boolean; is_activated?: boolean };
};

type DepartmentRecord = {
  open_department_id?: string;
  department_id?: string;
  name?: string;
  parent_department_id?: string;
  member_count?: number;
  status?: { is_deleted?: boolean };
};

type GetUserParams = {
  auth: FeishuAuthValue;
  input: GetUserInput;
};

type GetUserResponse = { user?: UserRecord };

type UpdateUserParams = {
  auth: FeishuAuthValue;
  input: UpdateUserInput;
};

type SetUserSuspendedParams = {
  auth: FeishuAuthValue;
  input: SetUserSuspendedInput;
};

type ProvisionUserParams = {
  auth: FeishuAuthValue;
  input: ProvisionUserInput;
};

type LookupUserParams = {
  auth: FeishuAuthValue;
  mobile?: string | undefined;
  email?: string | undefined;
  includeResigned?: boolean | undefined;
};

type RecoverParams = {
  auth: FeishuAuthValue;
  error: Error;
  mobile: string;
  email?: string | undefined;
};

type ListDepartmentUsersParams = {
  auth: FeishuAuthValue;
  input: { departmentId: string; includeSubDepartments: boolean; maxItems: number };
};

type ListDepartmentsParams = {
  auth: FeishuAuthValue;
  input: { parentDepartmentId: string; includeAllLevels: boolean; maxItems: number };
};

type BatchGetIdResponse = {
  user_list?: {
    user_id?: string;
    email?: string;
    mobile?: string;
    status?: { is_frozen?: boolean; is_resigned?: boolean };
  }[];
};

type CreateUserResponse = {
  user: { open_id: string; user_id?: string; union_id?: string };
};
