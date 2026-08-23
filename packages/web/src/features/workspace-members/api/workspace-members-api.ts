import {
  DefaultWorkspaceRole,
  SeekPage,
  WorkspaceMember,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const workspaceMembersApi = {
  list(workspaceId: string): Promise<SeekPage<WorkspaceMember>> {
    return api.get<SeekPage<WorkspaceMember>>('/v1/workspace-members', {
      workspaceId,
    });
  },
  upsert(request: {
    workspaceId: string;
    userId: string;
    role: DefaultWorkspaceRole;
  }): Promise<WorkspaceMember> {
    return api.post<WorkspaceMember>('/v1/workspace-members', request);
  },
  delete(request: { id: string; workspaceId: string }): Promise<void> {
    return api.delete<void>(`/v1/workspace-members/${request.id}`, {
      workspaceId: request.workspaceId,
    });
  },
};
