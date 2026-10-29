import { DefaultProjectRole, ProjectType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { projectSharingUtils } from '@/features/project-members';
import { memberRows } from '@/features/project-workspace/lib/member-rows';
import { projectRoleLabels } from '@/features/project-workspace/lib/role-labels';

describe('projectSharingUtils', () => {
  it('treats only personal projects as unshareable', () => {
    expect(projectSharingUtils.isPersonal({ type: ProjectType.PERSONAL })).toBe(
      true,
    );
    expect(projectSharingUtils.isPersonal({ type: ProjectType.TEAM })).toBe(
      false,
    );
    expect(projectSharingUtils.isPersonal(undefined)).toBe(false);
  });

  it('explains the real reason and points to team projects', () => {
    expect(projectSharingUtils.personalReason()).toContain('team project');
  });
});

describe('project role labels', () => {
  it('calls the Admin role "Admin" so it is not confused with the project owner', () => {
    expect(projectRoleLabels.label(DefaultProjectRole.ADMIN)).toBe('Admin');
    expect(
      projectRoleLabels.memberLabel({
        role: DefaultProjectRole.ADMIN,
        isOwner: true,
      }),
    ).toBe('Owner');
    expect(projectRoleLabels.label(DefaultProjectRole.VIEWER)).toBe('Can view');
    expect(projectRoleLabels.label(DefaultProjectRole.DEVELOPER)).toBe(
      'Can edit',
    );
  });

  it('marks the owner row so it shows as the owner', () => {
    const rows = memberRows.build({
      members: [],
      ownerId: 'u1',
      ownerName: 'Lin',
    });
    expect(rows).toEqual([
      expect.objectContaining({ userId: 'u1', isOwner: true, implicit: true }),
    ]);
  });
});
