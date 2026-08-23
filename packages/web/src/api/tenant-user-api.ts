import { SeekPage } from '@fema-ipaas/core-utils';
import {
  UpdateUserRequestBody,
  User,
  UserWithMetaInformation,
  ListUsersRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const tenantUserApi = {
  list(request: ListUsersRequestBody) {
    return api.get<SeekPage<UserWithMetaInformation>>('/v1/users', request);
  },
  delete(id: string) {
    return api.delete(`/v1/users/${id}`);
  },
  update(id: string, request: UpdateUserRequestBody): Promise<User> {
    return api.post<User>(`/v1/users/${id}`, request);
  },
};
