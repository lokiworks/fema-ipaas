import { UpdateMeResponse, UserWithMetaInformation } from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const userApi = {
  getUserById(id: string) {
    return api.get<UserWithMetaInformation>(`/v1/users/${id}`);
  },
  updateMe(profilePicture?: File): Promise<UpdateMeResponse> {
    const formData = new FormData();
    if (profilePicture) {
      formData.append('profilePicture', profilePicture);
    }

    return api.any<UpdateMeResponse>('/v1/users/me', {
      method: 'POST',
      data: formData,
    });
  },
};
