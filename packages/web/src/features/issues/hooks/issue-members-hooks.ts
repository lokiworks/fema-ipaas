import { DefaultProjectRole } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useMemo } from 'react';

import { projectMembersHooks } from '@/features/project-members';
import { memberRows } from '@/features/project-workspace/lib/member-rows';
import { projectDirectoryHooks } from '@/features/projects/api/project-directory-api';
import { projectCollectionUtils } from '@/features/projects/stores/project-collection';

function useIssueMembers() {
  const { data } = projectMembersHooks.useMembers();
  const { project } = projectCollectionUtils.useCurrentProject();
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const ownerName = directory?.find(
    (item) => item.id === project?.id,
  )?.ownerName;
  const ownerId = project?.ownerId;
  return useMemo(() => {
    const rows = memberRows.build({
      members: data?.data ?? [],
      ownerId,
      ownerName,
    });
    const assignable = rows
      .filter((row) => row.role !== DefaultProjectRole.VIEWER)
      .map((row) => ({ id: row.userId, name: row.name }));
    const names = new Map(rows.map((row) => [row.userId, row.name]));
    const nameOf = (userId: string | null): string => {
      if (userId === null) {
        return t('System');
      }
      return names.get(userId) ?? t('Unknown user');
    };
    return { assignable, nameOf };
  }, [data, ownerId, ownerName]);
}

export const issueMembersHooks = {
  useIssueMembers,
};

export type MemberOption = {
  id: string;
  name: string;
};
