import { formErrors, DefaultProjectRole } from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { internalErrorToast } from '@/components/ui/sonner';
import { userInvitationMutations } from '@/features/invitations';

export function InviteMemberDialog({ disabled }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        {t('Invite member')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Invite member')}</DialogTitle>
          <DialogDescription>
            {t(
              'They receive an email with a link. The role decides what they can do once they join.',
            )}
          </DialogDescription>
        </DialogHeader>
        <InviteMemberForm
          key={open ? 'open' : 'closed'}
          onInvited={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function InviteMemberForm({ onInvited }: { onInvited: () => void }) {
  const form = useForm<InviteFormValues>({
    mode: 'onChange',
    resolver: zodResolver(
      z.object({
        email: z.email(formErrors.required),
        projectRole: z.enum(DefaultProjectRole),
      }),
    ),
    defaultValues: { email: '', projectRole: DefaultProjectRole.OPERATOR },
  });

  const { mutate: invite, isPending } =
    userInvitationMutations.useInviteToProject({
      onSuccess: () => {
        toast.success(t('invitationsSentCount', { count: 1 }));
        onInvited();
      },
    });

  return (
    <Form {...form}>
      <form
        className="grid space-y-4"
        onSubmit={form.handleSubmit((values) =>
          invite(values, { onError: () => internalErrorToast() }),
        )}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="grid space-y-2">
              <Label htmlFor="inviteEmail" showRequiredIndicator>
                {t('Email')}
              </Label>
              <Input
                {...field}
                id="inviteEmail"
                type="email"
                placeholder="lisi@example.com"
                className="rounded-sm"
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="projectRole"
          render={({ field }) => (
            <FormItem className="grid space-y-2">
              <Label htmlFor="inviteRole">{t('Role')}</Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="inviteRole">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DefaultProjectRole).map((role) => (
                    <SelectItem key={role} value={role}>
                      {t(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" loading={isPending}>
            {t('Send invitation')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

type InviteFormValues = {
  email: string;
  projectRole: DefaultProjectRole;
};

type InviteMemberDialogProps = {
  disabled: boolean;
};
