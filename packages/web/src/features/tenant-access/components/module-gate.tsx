import {
  CreateModuleAccessRequestBody,
  ModuleAccessContact,
  PermissionDeniedHint,
  TenantModule,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Lock } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';

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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { tenantAccessHooks } from '../hooks/tenant-access-hooks';
import { tenantAccessUtils } from '../utils/tenant-access-utils';

export function ModuleGate({
  module,
  children,
}: {
  module: TenantModule;
  children: ReactNode;
}) {
  const { data: access, isLoading } = tenantAccessHooks.useMyAccess();
  if (isLoading) {
    return <Skeleton className="m-6 h-40" />;
  }
  if (!access || access.modules.includes(module)) {
    return <>{children}</>;
  }
  return (
    <div className="flex w-full justify-start p-6">
      <ModuleDeniedPanel
        module={module}
        deniedHint={access.deniedHint}
        contacts={access.contacts}
        url={access.url ?? null}
        allowRequests={access.allowRequests}
        notice={access.notice}
        pending={access.pendingModules.includes(module)}
        interactive
      />
    </div>
  );
}

export function ModuleDeniedPanel({
  module,
  deniedHint,
  contacts,
  url,
  allowRequests,
  notice,
  pending,
  interactive,
  className,
}: {
  module: TenantModule;
  deniedHint: PermissionDeniedHint;
  contacts: ModuleAccessContact[];
  url: string | null;
  allowRequests: boolean;
  notice: string;
  pending: boolean;
  interactive: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const moduleName = tenantAccessUtils.moduleLabel(module);
  const canApply = deniedHint === PermissionDeniedHint.APPLY && allowRequests;
  return (
    <div
      className={cn(
        'flex max-w-md flex-col items-start gap-3 rounded-lg border p-6',
        className,
      )}
    >
      <Lock className="size-6 text-muted-foreground" />
      <div className="text-base font-medium">
        {t('You do not have access to {module}', { module: moduleName })}
      </div>
      {(deniedHint === PermissionDeniedHint.ADMINS ||
        deniedHint === PermissionDeniedHint.PERSON) && (
        <div className="text-sm text-muted-foreground">
          {contacts.length === 0
            ? t('No admin is available to contact yet')
            : t('Please contact {names}', {
                names: contacts
                  .map((contact) => `${contact.name} (${contact.email})`)
                  .join(', '),
              })}
        </div>
      )}
      {deniedHint === PermissionDeniedHint.URL &&
        (url ? (
          <a
            className="text-sm text-primary underline-offset-4 hover:underline"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('See how to get access')}
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">
            {t('No link has been set')}
          </span>
        ))}
      {canApply && (
        <>
          <Button
            size="sm"
            disabled={!interactive || pending}
            onClick={() => setOpen(true)}
          >
            {pending ? t('Request pending review') : t('Request access')}
          </Button>
          {notice.length > 0 && (
            <div className="text-xs text-muted-foreground">{notice}</div>
          )}
        </>
      )}
      {interactive && (
        <RequestAccessDialog
          open={open}
          onOpenChange={setOpen}
          module={module}
          notice={notice}
        />
      )}
    </div>
  );
}

function RequestAccessDialog({
  open,
  onOpenChange,
  module,
  notice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: TenantModule;
  notice: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <RequestAccessForm
          key={open ? 'open' : 'closed'}
          module={module}
          notice={notice}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function RequestAccessForm({
  module,
  notice,
  onOpenChange,
}: {
  module: TenantModule;
  notice: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate: submit, isPending } = tenantAccessHooks.useRequestModule();
  const form = useForm<CreateModuleAccessRequestBody>({
    resolver: zodResolver(CreateModuleAccessRequestBody),
    mode: 'onChange',
    defaultValues: requestDefaults(module),
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          submit(values, { onSuccess: () => onOpenChange(false) }),
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {t('Request access to {module}', {
              module: tenantAccessUtils.moduleLabel(module),
            })}
          </DialogTitle>
          {notice.length > 0 && (
            <DialogDescription>{notice}</DialogDescription>
          )}
        </DialogHeader>
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Reason')}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} maxLength={200} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Submit request')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function requestDefaults(module: TenantModule): CreateModuleAccessRequestBody {
  return {
    module:
      module === TenantModule.MCP_SERVICES ||
      module === TenantModule.PLATFORM_ADMIN
        ? module
        : TenantModule.CONNECTOR_DEVELOPMENT,
    reason: '',
  };
}
