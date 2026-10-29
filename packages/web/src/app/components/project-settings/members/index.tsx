import {
  DefaultProjectRole,
  InvitationStatus,
  ProjectWithLimits,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Info, Plus, Trash } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SkeletonList } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  userInvitationMutations,
  userInvitationsHooks,
} from '@/features/invitations';
import { PendingAccessRequests } from '@/features/project-access-requests';
import {
  projectMembersHooks,
  projectSharingUtils,
} from '@/features/project-members';
import { DisabledReason } from '@/features/project-workspace/components/disabled-reason';
import { ProjectInfoDialog } from '@/features/project-workspace/components/project-info-dialog';
import {
  MemberRow,
  memberRows,
} from '@/features/project-workspace/lib/member-rows';
import { projectRoleLabels } from '@/features/project-workspace/lib/role-labels';
import { projectDirectoryHooks } from '@/features/projects/api/project-directory-api';
import { projectCollectionUtils } from '@/features/projects/stores/project-collection';

import { InviteMemberDialog } from './invite-member-dialog';

export function MembersSettings({
  project,
  readonly,
  onCreatedTeamProject,
}: MembersSettingsProps) {
  const projectId = project.id;
  const personal = projectSharingUtils.isPersonal(project);
  const { data: members, isLoading } = projectMembersHooks.useMembers({
    projectId,
  });
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const { mutate: updateRole } = projectMembersHooks.useUpdateMemberRole({
    projectId,
  });
  const { mutateAsync: removeMember } = projectMembersHooks.useRemoveMember({
    projectId,
  });

  const { invitations, isLoading: isLoadingInvitations } =
    userInvitationsHooks.useInvitations({ projectId, enabled: !personal });
  const { mutateAsync: revokeInvitation } =
    userInvitationMutations.useRevokeInvitation({
      projectId,
      onSuccess: () => toast.success(t('Invitation revoked')),
    });

  if (isLoading || (!personal && isLoadingInvitations)) {
    return <SkeletonList numberOfItems={3} className="h-12" />;
  }

  const rows = memberRows.build({
    members: members?.data ?? [],
    ownerId: project.ownerId,
    ownerName: directory?.find((item) => item.id === project.id)?.ownerName,
  });
  const adminCount = rows.filter(
    (row) => row.role === DefaultProjectRole.ADMIN,
  ).length;
  const isSoleOwner = (member: MemberRow) =>
    member.userId === project.ownerId ||
    (member.role === DefaultProjectRole.ADMIN && adminCount === 1);
  const pending = (invitations ?? []).filter(
    (invitation) => invitation.status === InvitationStatus.PENDING,
  );

  return (
    <div className="flex flex-col gap-4">
      {personal ? (
        <PersonalProjectNotice onCreated={onCreatedTeamProject} />
      ) : (
        <>
          {!readonly && <PendingAccessRequests projectId={projectId} />}
          <div className="flex items-center justify-end">
            <InviteMemberDialog projectId={projectId} disabled={readonly} />
          </div>
        </>
      )}
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('No one has been added to this project yet.')}
        </p>
      )}
      <div className="flex flex-col divide-y">
        {rows.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between gap-4 py-3"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {member.name}
              </span>
              {member.email && (
                <span className="truncate text-xs text-muted-foreground">
                  {member.email}
                </span>
              )}
            </div>
            {member.implicit ? (
              <span className="shrink-0 pr-3 text-sm text-muted-foreground">
                {projectRoleLabels.memberLabel({
                  role: member.role,
                  isOwner: member.isOwner,
                })}
              </span>
            ) : isSoleOwner(member) ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="shrink-0 cursor-default pr-3 text-sm text-muted-foreground"
                  >
                    {projectRoleLabels.memberLabel({
                      role: member.role,
                      isOwner: member.isOwner,
                    })}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {member.isOwner
                    ? t('The project owner always has full access.')
                    : t('A project needs at least one admin.')}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={member.role}
                  disabled={readonly || personal}
                  onValueChange={(value) => {
                    const role = Object.values(DefaultProjectRole).find(
                      (candidate) => candidate === value,
                    );
                    if (!role) {
                      return;
                    }
                    updateRole({ userId: member.userId, role });
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue>
                      {projectRoleLabels.label(member.role)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(DefaultProjectRole).map((role) => (
                      <SelectItem key={role} value={role}>
                        <div className="flex flex-col">
                          <span>{projectRoleLabels.label(role)}</span>
                          <span className="text-xs text-muted-foreground">
                            {projectRoleLabels.description(role)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DisabledReason
                  reason={
                    readonly
                      ? t(
                          'Only the project owner or an admin can remove members',
                        )
                      : null
                  }
                >
                  <ConfirmationDeleteDialog
                    title={t('Remove from project')}
                    message={t(
                      'They lose access to every workflow and connection in this project.',
                    )}
                    mutationFn={async () => {
                      await removeMember(member.id);
                      toast.success(
                        t('Removed {name} from the project', {
                          name: member.name,
                        }),
                      );
                    }}
                    entityName={member.name}
                    targetName={member.name}
                    buttonText={t('removeMemberAction')}
                  >
                    <Button variant="ghost" size="sm" disabled={readonly}>
                      <Trash className="size-4" />
                    </Button>
                  </ConfirmationDeleteDialog>
                </DisabledReason>
              </div>
            )}
          </div>
        ))}
      </div>
      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t('Pending invitations')}</h3>
          <div className="flex flex-col divide-y">
            {pending.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {invitation.email}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {projectRoleLabels.label(
                      Object.values(DefaultProjectRole).find(
                        (role) => role === invitation.projectRoleId,
                      ) ?? DefaultProjectRole.VIEWER,
                    )}
                    {' · '}
                    <FormattedDate date={new Date(invitation.created)} />
                  </span>
                </div>
                <ConfirmationDeleteDialog
                  title={t('Revoke invitation')}
                  message={t('invitationRevokeConsequence')}
                  mutationFn={async () => {
                    await revokeInvitation(invitation.id);
                  }}
                  entityName={invitation.email}
                  targetName={invitation.email}
                  buttonText={t('Revoke')}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={readonly}
                    aria-label={t('Revoke invitation')}
                  >
                    <Trash className="size-4" />
                  </Button>
                </ConfirmationDeleteDialog>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PersonalProjectNotice({ onCreated }: { onCreated: () => void }) {
  const [creating, setCreating] = useState(false);
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3"
      data-testid="personal-project-notice"
    >
      <div className="flex min-w-0 items-start gap-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">
            {t('This is your personal project')}
          </span>
          <span className="text-muted-foreground">
            {projectSharingUtils.personalReason()}
          </span>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setCreating(true)}
      >
        <Plus className="size-4" />
        {t('New team project')}
      </Button>
      <ProjectInfoDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(created) => {
          onCreated();
          projectCollectionUtils.setCurrentProject(
            created.id,
            `/projects/${created.id}/home`,
          );
        }}
      />
    </div>
  );
}

type MembersSettingsProps = {
  project: Pick<ProjectWithLimits, 'id' | 'type' | 'ownerId'>;
  readonly: boolean;
  onCreatedTeamProject: () => void;
};
