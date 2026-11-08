import { OperatorCreateTenantRequestBody } from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { internalErrorMessage } from '@/components/ui/sonner';
import {
  CreateTenantFormValues,
  LimitFields,
  operatorHooks,
  operatorSchemas,
  operatorUtils,
} from '@/features/operator';
import { FormServerError } from '@/features/tenant-access';
import { api } from '@/lib/api';

export function CreateTenantDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <CreateTenantForm
          key={open ? 'open' : 'closed'}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateTenantForm({ onClose }: { onClose: () => void }) {
  const form = useForm<CreateTenantFormValues>({
    mode: 'onChange',
    resolver: zodResolver(operatorSchemas.createTenantForm),
    defaultValues: createTenantDefaults(),
  });
  const {
    mutate: create,
    isPending,
    data: created,
  } = operatorHooks.useCreateTenant({
    onError: (error) =>
      form.setError('root.serverError', {
        type: 'manual',
        message: api.extractServerErrorMessage(error, internalErrorMessage()),
      }),
  });

  if (created) {
    return (
      <div className="flex flex-col gap-4" data-testid="tenant-created">
        <DialogHeader>
          <DialogTitle>{t('Tenant created')}</DialogTitle>
          <DialogDescription>
            {created.ownerInvitationUrl
              ? t(
                  'Send this link to the owner so they can activate the account. It expires after 7 days.',
                )
              : t('The owner can sign in right away.')}
          </DialogDescription>
        </DialogHeader>
        {created.ownerInvitationUrl && (
          <CopyToClipboardInput
            textToCopy={created.ownerInvitationUrl}
            useInput={true}
          />
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t('Done')}</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => {
          form.clearErrors('root.serverError');
          const request = toRequest(values);
          const parsed = OperatorCreateTenantRequestBody.safeParse(request);
          if (!parsed.success) {
            form.setError('root.serverError', {
              type: 'manual',
              message: t(parsed.error.issues[0]?.message ?? 'required'),
            });
            return;
          }
          create(parsed.data);
        })}
      >
        <DialogHeader>
          <DialogTitle>{t('New tenant')}</DialogTitle>
          <DialogDescription>
            {t(
              'Create an organization and invite its owner. The owner then manages members and sign-in themselves.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator>{t('Tenant name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  data-testid="tenant-name"
                  onChange={(event) => {
                    field.onChange(event);
                    if (!form.getFieldState('slug').isDirty) {
                      form.setValue(
                        'slug',
                        operatorUtils.slugFromName(event.target.value),
                      );
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Sign-in address')}</FormLabel>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/t/</span>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="acme"
                    data-testid="tenant-slug"
                  />
                </FormControl>
              </div>
              <FormDescription>
                {t(
                  '3 to 40 lowercase letters, digits or hyphens. Leave empty to generate one.',
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-1.5">
          <FormField
            control={form.control}
            name="contact"
            render={({ field }) => (
              <FormItem>
                <FormLabel showRequiredIndicator>
                  {t('Owner email or mobile number')}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="owner@example.com / 13800138000"
                    data-testid="tenant-owner"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      {...field}
                      aria-label={t('Last name')}
                      placeholder={t('Last name')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      {...field}
                      aria-label={t('First name')}
                      placeholder={t('First name')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('Limits')}</span>
          <LimitFields />
        </div>
        <FormServerError
          message={form.formState.errors.root?.serverError?.message}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            type="submit"
            loading={isPending}
            data-testid="tenant-create-submit"
          >
            {t('Create tenant')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function toRequest(values: CreateTenantFormValues) {
  const owner = operatorUtils.buildOwnerInput({
    contact: values.contact,
    firstName: values.firstName,
    lastName: values.lastName,
  });
  const built = operatorUtils.buildLimitsUpdate(values.limits);
  return {
    name: values.name,
    ...(values.slug.length > 0 ? { slug: values.slug.toLowerCase() } : {}),
    owner,
    ...(built.ok ? { limits: built.limits } : {}),
  };
}

function createTenantDefaults(): CreateTenantFormValues {
  return {
    name: '',
    slug: '',
    contact: '',
    lastName: '',
    firstName: '',
    limits: operatorUtils.limitsInputsOf({
      usersLimit: null,
      projectsLimit: null,
      activeWorkflowsLimit: null,
      concurrentExecutionsLimit: null,
      workerGroupId: null,
    }),
  };
}
