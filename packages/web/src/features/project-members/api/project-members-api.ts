import {
  DefaultProjectRole,
  SeekPage,
  ProjectMember,
  ProjectMemberWithUser,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const projectMembersApi = {
  list(projectId: string): Promise<SeekPage<ProjectMemberWithUser>> {
    return api.get<SeekPage<ProjectMemberWithUser>>('/v1/project-members', {
      projectId,
    });
  },
  upsert(request: {
    projectId: string;
    userId: string;
    role: DefaultProjectRole;
  }): Promise<ProjectMember> {
    return api.post<ProjectMember>('/v1/project-members', request);
  },
  delete(request: { id: string; projectId: string }): Promise<void> {
    return api.delete<void>(`/v1/project-members/${request.id}`, {
      projectId: request.projectId,
    });
  },
};
