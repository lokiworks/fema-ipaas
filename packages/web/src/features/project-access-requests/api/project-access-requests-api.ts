import {
  ApproveProjectAccessRequestBody,
  CreateProjectAccessRequestBody,
  ProjectAccessRequest,
  ProjectAccessRequestWithUser,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const projectAccessRequestsApi = {
  create(
    request: CreateProjectAccessRequestBody,
  ): Promise<ProjectAccessRequest> {
    return api.post<ProjectAccessRequest>(
      '/v1/project-access-requests',
      request,
    );
  },
  listMine(): Promise<ProjectAccessRequest[]> {
    return api.get<ProjectAccessRequest[]>('/v1/project-access-requests/me');
  },
  listPending(projectId: string): Promise<ProjectAccessRequestWithUser[]> {
    return api.get<ProjectAccessRequestWithUser[]>(
      '/v1/project-access-requests',
      { projectId },
    );
  },
  approve({
    id,
    request,
  }: {
    id: string;
    request: ApproveProjectAccessRequestBody;
  }): Promise<ProjectAccessRequest> {
    return api.post<ProjectAccessRequest>(
      `/v1/project-access-requests/${id}/approve`,
      request,
    );
  },
  reject(id: string): Promise<ProjectAccessRequest> {
    return api.post<ProjectAccessRequest>(
      `/v1/project-access-requests/${id}/reject`,
    );
  },
};
