import {
  TenantMember,
  TenantMemberStatus,
  TenantModule,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { MoreHorizontal, UserPlus } from 'lucide-react';
import { useState } from 'react';

import { CenteredPage } from '@/app/components/centered-page';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { SearchInput } from '@/components/custom/search-input';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';
import { tenantUserMutations } from '@/features/tenant-admin/hooks/tenant-user-hooks';
import { authenticationSession } from '@/lib/authentication-session';

import { AddUsersDialog } from './add-users-dialog';
import { EditAccessDialog } from './edit-access-dialog';
import { RemoveUserDialog } from './remove-user-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';

export default function UsersPage() {
  const { data, isLoading, refetch } = tenantAccessHooks.useMembers();
  const { mutate: setEnabled } = tenantAccessHooks.useSetEnabled();
  const { mutate: revokeInvitation } = tenantUserMutations.useDeleteInvitation({
    onSuccess: () => refetch(),
  });
  const currentUserId = authenticationSession.getCurrentUserId();
  const [scope, setScope] = useState<'all' | 'external'>('all');
  const [status, setStatus] = useState<TenantMemberStatus | 'any'>('any');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<MemberDialog | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const members = data?.members ?? [];
  const query = search.trim().toLowerCase();
  const visible = members.filter(
    (member) =>
      (scope === 'all' || member.external) &&
      (status === 'any' || member.status === status) &&
      (query.length === 0 ||
        `${member.firstName} ${member.lastName} ${member.email}`
          .toLowerCase()
          .includes(query)),
  );

  return (
    <CenteredPage
      widthClassName="max-w-[64rem]"
      title={t('Users')}
      description={t(
        'Assign module permissions to members. Business integration is granted to everyone and cannot be removed.',
      )}
      actions={
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="size-4" />
          {t('Add users')}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Tabs
          value={scope}
          onValueChange={(value) =>
            setScope(value === 'external' ? 'external' : 'all')
          }
        >
          <TabsList>
            <TabsTrigger value="all">{t('All users')}</TabsTrigger>
            <TabsTrigger value="external">
              {t('External users only')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Select
          value={status}
          onValueChange={(value) =>
            setStatus(
              Object.values(TenantMemberStatus).find(
                (candidate) => candidate === value,
              ) ?? 'any',
            )
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t('Any status')}</SelectItem>
            {Object.values(TenantMemberStatus).map((value) => (
              <SelectItem key={value} value={value}>
                {tenantAccessUtils.memberStatusLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="min-w-56 flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('Search by name or email')}
          />
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('User')}</TableHead>
              <TableHead className="w-28">{t('Status')}</TableHead>
              <TableHead className="w-28">{t('Platform role')}</TableHead>
              <TableHead className="w-56">{t('Module permissions')}</TableHead>
              <TableHead className="w-28">{t('Last active')}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {t('No users match these filters')}
                </TableCell>
              </TableRow>
            )}
            {visible.map((member) => (
              <TableRow key={`${member.kind}-${member.id}`}>
                <TableCell>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <TextWithTooltip
                        tooltipMessage={tenantAccessUtils.memberDisplayName(
                          member,
                        )}
                      >
                        <p className="truncate font-medium">
                          {tenantAccessUtils.memberDisplayName(member)}
                        </p>
                      </TextWithTooltip>
                      {member.id === currentUserId && (
                        <Badge variant="inverted">{t('You')}</Badge>
                      )}
                      {member.external && (
                        <Badge variant="accent">{t('External')}</Badge>
                      )}
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={member.status} />
                </TableCell>
                <TableCell>
                  {tenantAccessUtils.roleLabel({
                    tenantRole: member.tenantRole,
                    isOwner: member.isOwner,
                  })}
                </TableCell>
                <TableCell>
                  <ModuleBadges modules={member.modules} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {member.lastActiveDate ? (
                    <FormattedDate date={new Date(member.lastActiveDate)} />
                  ) : member.kind === 'INVITATION' ? (
                    t('Never signed in')
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  <MemberActions
                    member={member}
                    locked={member.isOwner || member.id === currentUserId}
                    emailAuthEnabled={data?.emailAuthEnabled ?? false}
                    onEdit={() => setDialog({ kind: 'edit', member })}
                    onReset={() => setDialog({ kind: 'reset', member })}
                    onRemove={() => setDialog({ kind: 'remove', member })}
                    onToggle={() =>
                      setEnabled({
                        userId: member.id,
                        enabled: member.status === TenantMemberStatus.DISABLED,
                      })
                    }
                    onRevoke={async () => revokeInvitation(member.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <AddUsersDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        homeDomains={data?.homeDomains ?? []}
        emailDelivery={data?.emailDelivery ?? false}
      />
      <EditAccessDialog
        member={dialog?.kind === 'edit' ? dialog.member : null}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <ResetPasswordDialog
        member={dialog?.kind === 'reset' ? dialog.member : null}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <RemoveUserDialog
        member={dialog?.kind === 'remove' ? dialog.member : null}
        members={members}
        onOpenChange={(open) => !open && setDialog(null)}
      />
    </CenteredPage>
  );
}

function StatusBadge({ status }: { status: TenantMemberStatus }) {
  const variant =
    status === TenantMemberStatus.ACTIVE
      ? 'success'
      : status === TenantMemberStatus.PENDING
      ? 'info'
      : 'outline';
  return (
    <Badge variant={variant}>
      {tenantAccessUtils.memberStatusLabel(status)}
    </Badge>
  );
}

function ModuleBadges({ modules }: { modules: TenantModule[] }) {
  const extra = modules.filter(
    (module) => module !== TenantModule.BUSINESS_INTEGRATION,
  );
  if (extra.length === 0) {
    return (
      <span className="text-muted-foreground">
        {t('Business integration only')}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {extra.map((module) => (
        <Badge key={module} variant="outline">
          {tenantAccessUtils.moduleLabel(module)}
        </Badge>
      ))}
    </div>
  );
}

function MemberActions({
  member,
  locked,
  emailAuthEnabled,
  onEdit,
  onReset,
  onRemove,
  onToggle,
  onRevoke,
}: {
  member: TenantMember;
  locked: boolean;
  emailAuthEnabled: boolean;
  onEdit: () => void;
  onReset: () => void;
  onRemove: () => void;
  onToggle: () => void;
  onRevoke: () => Promise<void>;
}) {
  if (member.kind === 'INVITATION') {
    return (
      <ConfirmationDeleteDialog
        title={t('Revoke invitation')}
        message={t('The invitation link stops working right away.')}
        entityName={member.email}
        buttonText={t('Revoke')}
        mutationFn={onRevoke}
      >
        <Button variant="ghost" size="sm">
          {t('Revoke')}
        </Button>
      </ConfirmationDeleteDialog>
    );
  }
  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground">—</span>
        </TooltipTrigger>
        <TooltipContent>
          {t('The owner and your own account cannot be changed here')}
        </TooltipContent>
      </Tooltip>
    );
  }
  const resetDisabledReason = !emailAuthEnabled
    ? t('Email and password sign-in is not enabled')
    : member.status !== TenantMemberStatus.ACTIVE
    ? t('Only active users can have their password reset')
    : null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('More actions')}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          {t('Edit permissions')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggle}>
          {member.status === TenantMemberStatus.DISABLED
            ? t('Enable')
            : t('Disable')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={resetDisabledReason !== null}
          onSelect={onReset}
        >
          <div className="flex flex-col">
            <span>{t('Reset password')}</span>
            {resetDisabledReason && (
              <span className="text-xs text-muted-foreground">
                {resetDisabledReason}
              </span>
            )}
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          {t('Remove user')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type MemberDialog = {
  kind: 'edit' | 'reset' | 'remove';
  member: TenantMember;
};
