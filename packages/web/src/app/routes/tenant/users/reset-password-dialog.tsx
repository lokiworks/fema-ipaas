import { TenantMember } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';

export function ResetPasswordDialog({
  member,
  onOpenChange,
}: {
  member: TenantMember | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {member && (
          <ResetPasswordBody
            key={member.id}
            member={member}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordBody({
  member,
  onOpenChange,
}: {
  member: TenantMember;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    mutate: reset,
    data,
    isPending,
  } = tenantAccessHooks.useResetPassword();
  const name = tenantAccessUtils.memberDisplayName(member);
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('Reset password for {name}', { name })}</DialogTitle>
        <DialogDescription>
          {data
            ? t(
                'This temporary password is shown only once. Send it to {name} through a channel you trust and ask them to change it after signing in.',
                { name },
              )
            : t(
                'The old password stops working right away and every session of {name} is signed out. You will get a temporary password to hand over.',
                { name },
              )}
        </DialogDescription>
      </DialogHeader>
      {data && (
        <CopyToClipboardInput
          textToCopy={data.temporaryPassword}
          useInput={true}
        />
      )}
      <DialogFooter>
        {data ? (
          <Button onClick={() => onOpenChange(false)}>{t('Done')}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('Cancel')}
            </Button>
            <Button loading={isPending} onClick={() => reset(member.id)}>
              {t('Generate temporary password')}
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}
