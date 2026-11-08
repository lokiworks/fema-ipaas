import { UpdateTenantSlugRequestBody } from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
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
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { tenantAccessUtils } from '../utils/tenant-access-utils';

import { FormServerError } from './form-server-error';

export function SlugDialog({
  open,
  onOpenChange,
  currentSlug,
  pending,
  serverError,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSlug: string;
  pending: boolean;
  serverError: string | null;
  onSubmit: (slug: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <SlugForm
          key={open ? currentSlug : 'closed'}
          currentSlug={currentSlug}
          pending={pending}
          serverError={serverError}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function SlugForm({
  currentSlug,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: {
  currentSlug: string;
  pending: boolean;
  serverError: string | null;
  onSubmit: (slug: string) => void;
  onCancel: () => void;
}) {
  const form = useForm<UpdateTenantSlugRequestBody>({
    mode: 'onChange',
    resolver: zodResolver(UpdateTenantSlugRequestBody),
    defaultValues: { slug: currentSlug },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => {
          if (values.slug === currentSlug) {
            onCancel();
            return;
          }
          onSubmit(values.slug);
        })}
      >
        <DialogHeader>
          <DialogTitle>{t('Change sign-in address')}</DialogTitle>
          <DialogDescription>
            {t(
              'The old address stops working right away. Tell members the new one.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {tenantAccessUtils.tenantLoginPath('')}
                </span>
                <FormControl>
                  <Input
                    {...field}
                    aria-label={t('Sign-in address')}
                    data-testid="slug-input"
                  />
                </FormControl>
              </div>
              <FormDescription>
                {t('3 to 40 lowercase letters, digits or hyphens.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormServerError message={serverError ?? undefined} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={pending} data-testid="slug-save">
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
