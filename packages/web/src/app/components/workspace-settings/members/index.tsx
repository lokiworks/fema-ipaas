import { DefaultWorkspaceRole } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Trash } from 'lucide-react';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SkeletonList } from '@/components/ui/skeleton';
import { workspaceMembersHooks } from '@/features/workspace-members';

const ROLE_DESCRIPTIONS: Record<DefaultWorkspaceRole, string> = {
  [DefaultWorkspaceRole.ADMIN]: 'Full control of the workspace',
  [DefaultWorkspaceRole.DEVELOPER]: 'Build and publish workflows',
  [DefaultWorkspaceRole.OPERATOR]: 'Run workflows and manage connections',
  [DefaultWorkspaceRole.VIEWER]: 'Read-only access',
};

export function MembersSettings({ readonly }: { readonly: boolean }) {
  const { data: members, isLoading } = workspaceMembersHooks.useMembers();
  const { mutate: updateRole } = workspaceMembersHooks.useUpdateMemberRole();
  const { mutate: removeMember } = workspaceMembersHooks.useRemoveMember();

  if (isLoading) {
    return <SkeletonList numberOfItems={3} className="h-12" />;
  }

  const rows = members?.data ?? [];

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('No one has been added to this workspace yet.')}
      </p>
    );
  }

  return (
    <div className="flex flex-col divide-y">
      {rows.map((member) => (
        <div
          key={member.id}
          className="flex items-center justify-between gap-4 py-3"
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {`${member.user.firstName} ${member.user.lastName}`.trim() ||
                member.user.email}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {member.user.email}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select
              value={member.role}
              disabled={readonly}
              onValueChange={(role) =>
                updateRole({
                  userId: member.userId,
                  role: role as DefaultWorkspaceRole,
                })
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(DefaultWorkspaceRole).map((role) => (
                  <SelectItem key={role} value={role}>
                    <div className="flex flex-col">
                      <span>{t(role)}</span>
                      <span className="text-xs text-muted-foreground">
                        {t(ROLE_DESCRIPTIONS[role])}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ConfirmationDeleteDialog
              title={t('Remove from workspace')}
              message={t(
                'They lose access to every workflow and connection in this workspace.',
              )}
              mutationFn={async () => removeMember(member.id)}
              entityName={t('member')}
            >
              <Button variant="ghost" size="sm" disabled={readonly}>
                <Trash className="size-4" />
              </Button>
            </ConfirmationDeleteDialog>
          </div>
        </div>
      ))}
    </div>
  );
}
