import {
  InstanceLimitsResponse,
  ProjectLimitsListResponse,
  ProjectLimitsUsage,
  UpdateProjectLimitsRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const limitsApi = {
  instance(): Promise<InstanceLimitsResponse> {
    return api.get<InstanceLimitsResponse>('/v1/limits/instance');
  },
  projects(): Promise<ProjectLimitsListResponse> {
    return api.get<ProjectLimitsListResponse>('/v1/limits/projects');
  },
  updateProject({
    projectId,
    request,
  }: {
    projectId: string;
    request: UpdateProjectLimitsRequestBody;
  }): Promise<ProjectLimitsUsage> {
    return api.post<ProjectLimitsUsage>(
      `/v1/limits/projects/${projectId}`,
      request,
    );
  },
  projectUsage(projectId: string): Promise<ProjectLimitsUsage> {
    return api.get<ProjectLimitsUsage>('/v1/limits/project-usage', {
      projectId,
    });
  },
};
