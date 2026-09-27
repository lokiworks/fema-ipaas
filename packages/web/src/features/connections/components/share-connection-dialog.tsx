import { isNil } from '@fema-ipaas/core-utils';
import {
  AddConnectionSharesRequestBody,
  connectionAccessUtils,
  ConnectionDetail,
  ConnectionPermission,
  ConnectionSharePermission,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { X } from 'lucide-react';
import { ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectSearch,
  MultiSelectTrigger,
  MultiSelectValue,
} from '@/components/custom/multi-select';
import { UserBadge } from '@/components/custom/user-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  connectionsMutations,
  connectionsQueries,
} from '@/features/connections/hooks/connections-hooks';

const sharePermissionOptions: {
  value: ConnectionSharePermission;
  label: string;
  description: string;
}[] = [
  {
    value: ConnectionSharePermission.USE,
    label: t('Can Use'),
    description: t('View the connection and use it in workflows'),
  },
  {
    value: ConnectionSharePermission.EDIT,
    label: t('Can Edit'),
    description: t('Can also edit, reconnect and share it'),
  },
];

function getPermissionLabel(permission: ConnectionSharePermission): string {
  const option = sharePermissionOptions.find(
    (item) => item.value === permission,
  );
  return option ? option.label : permission;
}

export function ShareConnectionDialog({
  connectionId,
  open,
  onOpenChange,
}: {
  connectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <ShareConnectionContent
          key={open ? 'open' : 'closed'}
          connectionId={connectionId}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ShareConnectionContent({
  connectionId,
  onClose,
}: {
  connectionId: string;
  onClose: () => void;
}) {
  const { data: detail } = connectionsQueries.useConnectionDetail({
    connectionId,
  });

  if (isNil(detail)) {
    return null;
  }

  const manage = connectionAccessUtils.canManage(detail.myPermission);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t('Share "{name}"', { name: detail.displayName })}
        </DialogTitle>
        <DialogDescription>
          {t(
            'Members you share with can use this connection in the projects it is available in. They will never see the secret values.',
          )}
        </DialogDescription>
      </DialogHeader>
      {manage ? (
        <AddShareForm connectionId={connectionId} detail={detail} />
      ) : (
        <Alert>
          <AlertDescription>
            {t('Only the owner and editors can manage sharing.')}
          </AlertDescription>
        </Alert>
      )}
      <ScrollArea viewPortClassName="max-h-72">
        <div className="flex flex-col gap-1">
          <MemberRow
            userId={detail.ownerId}
            firstName={detail.owner?.firstName}
            lastName={detail.owner?.lastName}
            email={detail.owner?.email}
            trailing={
              <span className="text-sm text-muted-foreground">
                {t('Owner')}
              </span>
            }
          />
          {detail.shares.length === 0 && (
            <div className="px-1 py-3 text-sm text-muted-foreground">
              {t('Not shared with anyone yet')}
            </div>
          )}
          {detail.shares.map((share) => (
            <MemberRow
              key={share.userId}
              userId={share.userId}
              firstName={share.user?.firstName}
              lastName={share.user?.lastName}
              email={share.user?.email}
              trailing={
                manage ? (
                  <ShareRowActions
                    connectionId={connectionId}
                    userId={share.userId}
                    permission={share.permission}
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {getPermissionLabel(share.permission)}
                  </span>
                )
              }
            />
          ))}
        </div>
      </ScrollArea>
      {detail.myPermission === ConnectionPermission.OWNER && (
        <DefaultMembersPermissionSelector
          connectionId={connectionId}
          detail={detail}
        />
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('Done')}
        </Button>
      </DialogFooter>
    </>
  );
}

function MemberRow({
  userId,
  firstName,
  lastName,
  email,
  trailing,
}: {
  userId: string | null | undefined;
  firstName?: string;
  lastName?: string;
  email?: string;
  trailing: ReactNode;
}) {
  const name = [firstName, lastName].filter(Boolean).join(' ');
  return (
    <div className="flex items-center gap-3 rounded-sm px-1 py-2">
      <UserBadge
        id={userId ?? null}
        size="medium"
        includeAvatar
        includeName={false}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{name || email || userId}</span>
        {email && (
          <span className="truncate text-xs text-muted-foreground">
            {email}
          </span>
        )}
      </div>
      {trailing}
    </div>
  );
}

function ShareRowActions({
  connectionId,
  userId,
  permission,
}: {
  connectionId: string;
  userId: string;
  permission: ConnectionSharePermission;
}) {
  const { mutate: updateShare } = connectionsMutations.useUpdateConnectionShare(
    {
      connectionId,
    },
  );
  const { mutate: removeShare } = connectionsMutations.useRemoveConnectionShare(
    {
      connectionId,
    },
  );
  return (
    <div className="flex items-center gap-1">
      <Select
        value={permission}
        onValueChange={(value) =>
          updateShare({
            userId,
            request: {
              permission:
                toProjectMembersPermission(value) ??
                ConnectionSharePermission.USE,
            },
          })
        }
      >
        <SelectTrigger size="sm" className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sharePermissionOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t('Remove')}
        onClick={() => removeShare({ userId })}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function AddShareForm({
  connectionId,
  detail,
}: {
  connectionId: string;
  detail: ConnectionDetail;
}) {
  const { data: usersPage } = connectionsQueries.useShareCandidates();
  const candidates = (usersPage?.data ?? []).filter(
    (user) =>
      user.id !== detail.ownerId &&
      !detail.shares.some((share) => share.userId === user.id),
  );
  const form = useForm<AddConnectionSharesRequestBody>({
    resolver: zodResolver(AddConnectionSharesRequestBody),
    defaultValues: { userIds: [], permission: ConnectionSharePermission.USE },
    mode: 'onChange',
  });
  const { mutateAsync, isPending } =
    connectionsMutations.useAddConnectionShares({
      connectionId,
    });

  const handleSubmit = form.handleSubmit(async (values) => {
    await mutateAsync(values);
    form.reset({ userIds: [], permission: values.permission });
  });

  return (
    <Form {...form}>
      <form
        className="flex items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <FormField
          control={form.control}
          name="userIds"
          render={({ field }) => (
            <FormItem className="min-w-0 flex-1">
              <MultiSelect
                value={field.value}
                onValueChange={(value) => field.onChange(value)}
                items={candidates.map((user) => ({
                  value: user.id,
                  label:
                    `${user.firstName} ${user.lastName}`.trim() || user.email,
                }))}
              >
                <MultiSelectTrigger>
                  <MultiSelectValue
                    placeholder={
                      candidates.length
                        ? t('Search and select members')
                        : t('No members available to add')
                    }
                  />
                </MultiSelectTrigger>
                <MultiSelectContent>
                  <MultiSelectSearch placeholder={t('Search...')} />
                  <MultiSelectList>
                    <MultiSelectEmpty>{t('No results')}</MultiSelectEmpty>
                    {candidates.map((user) => (
                      <MultiSelectItem key={user.id} value={user.id}>
                        {`${user.firstName} ${user.lastName}`.trim() ||
                          user.email}
                      </MultiSelectItem>
                    ))}
                  </MultiSelectList>
                </MultiSelectContent>
              </MultiSelect>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="permission"
          render={({ field }) => (
            <FormItem>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sharePermissionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={form.watch('userIds').length === 0}
          loading={isPending}
        >
          {t('Add')}
        </Button>
      </form>
    </Form>
  );
}

function toProjectMembersPermission(
  value: string,
): ConnectionSharePermission | null {
  switch (value) {
    case ConnectionSharePermission.EDIT:
      return ConnectionSharePermission.EDIT;
    case ConnectionSharePermission.USE:
      return ConnectionSharePermission.USE;
    default:
      return null;
  }
}

function DefaultMembersPermissionSelector({
  connectionId,
  detail,
}: {
  connectionId: string;
  detail: ConnectionDetail;
}) {
  const { mutate: updateAccess, isPending } =
    connectionsMutations.useUpdateConnectionAccess({ connectionId });
  const value = detail.projectMembersPermission ?? 'NONE';
  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border p-3">
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {t('All members of the available projects')}
        </span>
        <span className="text-xs text-muted-foreground">
          {t(
            'Default permission for everyone in the projects this connection is available in',
          )}
        </span>
      </div>
      <Select
        value={value}
        disabled={isPending}
        onValueChange={(next) =>
          updateAccess({
            allProjects: detail.allProjects,
            projectIds: detail.projectIds,
            projectMembersPermission: toProjectMembersPermission(next),
          })
        }
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="NONE">{t('None')}</SelectItem>
          {sharePermissionOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
