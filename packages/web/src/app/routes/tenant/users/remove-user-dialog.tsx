import { OwnedResourceType, TenantMember } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MemberPicker,
  tenantAccessHooks,
  tenantAccessUtils,
} from '@/features/tenant-access';

export function RemoveUserDialog({
  member,
  members,
  onOpenChange,
}: {
  member: TenantMember | null;
  members: TenantMember[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {member && (
          <RemoveUserBody
            key={member.id}
            member={member}
            members={members}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RemoveUserBody({
  member,
  members,
  onOpenChange,
}: {
  member: TenantMember;
  members: TenantMember[];
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = tenantAccessHooks.useOwnedBy(member.id);
  const { mutate: remove, isPending } = tenantAccessHooks.useRemoveMember();
  const [recipient, setRecipient] = useState<string | null>(null);
  const name = tenantAccessUtils.memberDisplayName(member);
  const owned = data?.resources ?? [];
  const needsRecipient = owned.length > 0;
  const groups = Object.values(OwnedResourceType)
    .map((type) => ({
      type,
      items: owned.filter((resource) => resource.type === type),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('Remove {name}?', { name })}</DialogTitle>
        <DialogDescription>{member.email}</DialogDescription>
      </DialogHeader>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : needsRecipient ? (
        <>
          <Alert variant="warning">
            <AlertTitle>
              {t('{name} still owns {count} resources', {
                name,
                count: owned.length,
              })}
            </AlertTitle>
            <AlertDescription>
              {t(
                'Transfer them to someone else first. Workflows and connections keep running after the transfer.',
              )}
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-1 text-sm">
            {groups.map((group) => (
              <div key={group.type} className="flex gap-2">
                <span className="w-28 shrink-0 text-muted-foreground">
                  {tenantAccessUtils.resourceTypeLabel(group.type)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {group.items
                    .slice(0, 3)
                    .map((item) => item.name)
                    .join(', ')}
                </span>
                <span className="font-medium">{group.items.length}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t('Transfer them to')}</Label>
            <MemberPicker
              members={members}
              value={recipient}
              onChange={setRecipient}
              excludeIds={[member.id]}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('{name} owns no resources and can be removed right away.', {
            name,
          })}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t(
          'After removal the user can no longer sign in and is taken out of every project.',
        )}
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t('Cancel')}
        </Button>
        <Button
          variant="destructive"
          loading={isPending}
          disabled={isLoading || (needsRecipient && recipient === null)}
          onClick={() =>
            remove(
              { userId: member.id, transferToUserId: recipient },
              { onSuccess: () => onOpenChange(false) },
            )
          }
        >
          {t('Remove')}
        </Button>
      </DialogFooter>
    </div>
  );
}
