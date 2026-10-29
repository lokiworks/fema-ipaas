import {
  formErrors,
  DefaultProjectRole,
  FlagId,
  InvitationStatus,
  UserInvitationWithLink,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

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
import { internalErrorMessage } from '@/components/ui/sonner';
import { userInvitationMutations } from '@/features/invitations';
import { invitationUtils } from '@/features/invitations/utils/invitation-utils';
import { projectMembersHooks } from '@/features/project-members';
import { DisabledReason } from '@/features/project-workspace/components/disabled-reason';
import { projectRoleLabels } from '@/features/project-workspace/lib/role-labels';
import { flagsHooks } from '@/hooks/flags-hooks';
import { api } from '@/lib/api';

export function InviteMemberDialog({
  projectId,
  disabled,
}: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const { data: smtpConfigured } = flagsHooks.useFlag<boolean>(
    FlagId.SMTP_CONFIGURED,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DisabledReason
        reason={
          disabled
            ? t('Only the project owner or an admin can invite members')
            : null
        }
      >
        <Button size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          {t('Invite member')}
        </Button>
      </DisabledReason>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Invite member')}</DialogTitle>
          <DialogDescription>
            {smtpConfigured === false
              ? t(
                  'Email is not configured, so no email is sent. You get a link to send them yourself. The role decides what they can do once they join.',
                )
              : t(
                  'They receive an email with a link. The role decides what they can do once they join.',
                )}
          </DialogDescription>
        </DialogHeader>
        <InviteMemberForm
          key={open ? 'open' : 'closed'}
          projectId={projectId}
          emailConfigured={smtpConfigured !== false}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function InviteMemberForm({
  projectId,
  onDone,
  emailConfigured,
}: InviteMemberFormProps) {
  const [sentWithoutEmail, setSentWithoutEmail] =
    useState<UserInvitationWithLink | null>(null);
  const form = useForm<InviteFormValues>({
    mode: 'onChange',
    resolver: zodResolver(
      z.object({
        email: z.email(formErrors.required),
        projectRole: z.enum(DefaultProjectRole),
      }),
    ),
    defaultValues: { email: '', projectRole: DefaultProjectRole.VIEWER },
  });

  const invalidateMembers = projectMembersHooks.useInvalidateMembers({
    projectId,
  });
  const { mutate: invite, isPending } =
    userInvitationMutations.useInviteToProject({
      projectId,
      onError: (error) =>
        form.setError('root.serverError', {
          type: 'manual',
          message: api.extractServerErrorMessage(error, internalErrorMessage()),
        }),
      onSuccess: (invitation) => {
        if (invitation.status === InvitationStatus.ACCEPTED) {
          void invalidateMembers();
          toast.success(
            t('{email} joined the project', { email: invitation.email }),
          );
          onDone();
          return;
        }
        if (invitationUtils.needsManualDelivery(invitation)) {
          setSentWithoutEmail(invitation);
          toast.success(t('Invite link created'));
          return;
        }
        toast.success(t('invitationsSentCount', { count: 1 }));
        onDone();
      },
    });

  if (sentWithoutEmail?.link) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'Send each person their link through a channel you trust. Links expire after 7 days.',
          )}
        </p>
        <div className="flex flex-col gap-1">
          <span className="text-sm">{sentWithoutEmail.email}</span>
          <CopyToClipboardInput
            textToCopy={sentWithoutEmail.link}
            useInput={true}
          />
        </div>
        <DialogFooter>
          <Button onClick={onDone}>{t('Done')}</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        className="grid space-y-4"
        onSubmit={form.handleSubmit((values) => {
          form.clearErrors('root.serverError');
          invite(values);
        })}
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
                  <SelectValue>
                    {projectRoleLabels.label(field.value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLE_ORDER.map((role) => (
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
              <p
                className="text-xs text-muted-foreground"
                data-testid="invite-role-description"
              >
                {projectRoleLabels.description(field.value)}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root?.serverError && (
          <p
            className="text-sm font-medium text-destructive"
            role="alert"
            data-testid="invite-server-error"
          >
            {form.formState.errors.root.serverError.message}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {emailConfigured ? t('Send invitation') : t('Create invite link')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const INVITE_ROLE_ORDER: DefaultProjectRole[] = [
  DefaultProjectRole.VIEWER,
  DefaultProjectRole.OPERATOR,
  DefaultProjectRole.DEVELOPER,
  DefaultProjectRole.ADMIN,
];

type InviteFormValues = {
  email: string;
  projectRole: DefaultProjectRole;
};

type InviteMemberFormProps = {
  projectId: string;
  onDone: () => void;
  emailConfigured: boolean;
};

type InviteMemberDialogProps = {
  projectId: string;
  disabled: boolean;
};
