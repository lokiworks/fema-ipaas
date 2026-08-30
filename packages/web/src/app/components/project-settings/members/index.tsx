import { DefaultProjectRole } from '@fema-ipaas/shared';
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
import { projectMembersHooks } from '@/features/project-members';

const ROLE_DESCRIPTIONS: Record<DefaultProjectRole, string> = {
  [DefaultProjectRole.ADMIN]: 'Full control of the project',
  [DefaultProjectRole.DEVELOPER]: 'Build and publish workflows',
  [DefaultProjectRole.OPERATOR]: 'Run workflows and manage connections',
  [DefaultProjectRole.VIEWER]: 'Read-only access',
};

export function MembersSettings({ readonly }: { readonly: boolean }) {
  const { data: members, isLoading } = projectMembersHooks.useMembers();
  const { mutate: updateRole } = projectMembersHooks.useUpdateMemberRole();
  const { mutate: removeMember } = projectMembersHooks.useRemoveMember();

  if (isLoading) {
    return <SkeletonList numberOfItems={3} className="h-12" />;
  }

  const rows = members?.data ?? [];

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('No one has been added to this project yet.')}
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
                  role: role as DefaultProjectRole,
                })
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(DefaultProjectRole).map((role) => (
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
              title={t('Remove from project')}
              message={t(
                'They lose access to every workflow and connection in this project.',
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
