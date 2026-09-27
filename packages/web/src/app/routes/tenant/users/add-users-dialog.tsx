import {
  AddTenantUsersResponse,
  formErrors,
  TENANT_ACCESS_LIMITS,
  TenantModule,
  TenantRole,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';

import { ModuleCheckboxes } from './module-checkboxes';

export function AddUsersDialog({
  open,
  onOpenChange,
  homeDomains,
  emailDelivery,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  homeDomains: string[];
  emailDelivery: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <AddUsersForm
          key={open ? 'open' : 'closed'}
          homeDomains={homeDomains}
          emailDelivery={emailDelivery}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddUsersForm({
  homeDomains,
  emailDelivery,
  onOpenChange,
}: {
  homeDomains: string[];
  emailDelivery: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate: invite, isPending } = tenantAccessHooks.useInviteMembers();
  const [result, setResult] = useState<AddTenantUsersResponse | null>(null);
  const form = useForm<AddUsersFormValues>({
    resolver: zodResolver(AddUsersFormSchema),
    mode: 'onChange',
    defaultValues: addUsersDefaults(),
  });
  const emails = tenantAccessUtils.parseEmails(form.watch('emails'));

  if (result) {
    return (
      <InviteResult
        result={result}
        onDone={() => onOpenChange(false)}
      />
    );
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          invite(
            {
              emails: tenantAccessUtils.parseEmails(values.emails),
              tenantRole: values.tenantRole,
              modules: values.modules,
            },
            { onSuccess: setResult },
          ),
        )}
      >
        <DialogHeader>
          <DialogTitle>{t('Add users')}</DialogTitle>
          <DialogDescription>
            {t(
              'Add up to 10 people at a time. They can sign in after activating their account from the invitation.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="emails"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Email addresses')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={4}
                  placeholder={
                    homeDomains.length > 0
                      ? `name@${homeDomains[0]}`
                      : 'name@example.com'
                  }
                />
              </FormControl>
              <FormDescription>
                {t('One per line, or separated by commas')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {emails.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {emails.map((email) => (
              <Badge
                key={email}
                variant={
                  tenantAccessUtils.isEmail(email) ? 'outline' : 'destructive'
                }
              >
                {email}
                {tenantAccessUtils.isExternalEmail({ email, homeDomains }) &&
                  ` · ${t('External')}`}
              </Badge>
            ))}
          </div>
        )}
        <FormField
          control={form.control}
          name="tenantRole"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Platform role')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {INVITABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {tenantAccessUtils.roleLabel({
                        tenantRole: role,
                        isOwner: false,
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="modules"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Module permissions')}</FormLabel>
              <ModuleCheckboxes
                value={field.value}
                onChange={field.onChange}
                isAdmin={form.watch('tenantRole') === TenantRole.ADMIN}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-xs text-muted-foreground">
          {emailDelivery
            ? t('Invitations are sent by email.')
            : t(
                'Email is not configured, so no invitation is sent. You will get an invitation link for each person to send them yourself.',
              )}
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('addUsersCount', { count: emails.length })}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function InviteResult({
  result,
  onDone,
}: {
  result: AddTenantUsersResponse;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          {t('invitedUsersCount', { count: result.invited.length })}
        </DialogTitle>
        <DialogDescription>
          {result.emailSent
            ? t('Invitations were sent by email.')
            : t(
                'Send each person their link through a channel you trust. Links expire after 7 days.',
              )}
        </DialogDescription>
      </DialogHeader>
      {!result.emailSent &&
        result.invited.map((invite) => (
          <div key={invite.email} className="flex flex-col gap-1">
            <span className="text-sm">{invite.email}</span>
            {invite.link && (
              <CopyToClipboardInput textToCopy={invite.link} useInput={true} />
            )}
          </div>
        ))}
      <DialogFooter>
        <Button onClick={onDone}>{t('Done')}</Button>
      </DialogFooter>
    </div>
  );
}

function addUsersDefaults(): AddUsersFormValues {
  return {
    emails: '',
    tenantRole: TenantRole.MEMBER,
    modules: [],
  };
}

const INVITABLE_ROLES = [TenantRole.MEMBER, TenantRole.OPERATOR, TenantRole.ADMIN];

const AddUsersFormSchema = z.object({
  emails: z
    .string()
    .refine(
      (value) => tenantAccessUtils.parseEmails(value).length > 0,
      formErrors.required,
    )
    .refine(
      (value) =>
        tenantAccessUtils.parseEmails(value).length <=
        TENANT_ACCESS_LIMITS.maxUsersPerBatch,
      'atMostTenUsers',
    )
    .refine(
      (value) =>
        tenantAccessUtils.parseEmails(value).every(tenantAccessUtils.isEmail),
      'invalidEmail',
    ),
  tenantRole: z.enum([TenantRole.ADMIN, TenantRole.MEMBER, TenantRole.OPERATOR]),
  modules: z.array(z.enum(TenantModule)),
});

type AddUsersFormValues = z.infer<typeof AddUsersFormSchema>;
