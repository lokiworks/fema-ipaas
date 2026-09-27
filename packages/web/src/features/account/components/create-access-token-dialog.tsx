import {
  CreatePersonalAccessTokenRequestBody,
  PersonalAccessTokenExpiry,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';

import { accountHooks } from '../hooks/account-hooks';
import { accountUtils, TOKEN_EXPIRY_OPTIONS } from '../utils/account-utils';

export function CreateAccessTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <CreateAccessTokenForm
          key={open ? 'open' : 'closed'}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateAccessTokenForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  const create = accountHooks.useCreateToken();
  const form = useForm<CreatePersonalAccessTokenRequestBody>({
    resolver: zodResolver(CreatePersonalAccessTokenRequestBody),
    defaultValues: { name: '', expiry: PersonalAccessTokenExpiry.DAYS_90 },
    mode: 'onChange',
  });

  if (secret !== null) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t('Token created')}</DialogTitle>
        </DialogHeader>
        <Alert variant="warning">
          <TriangleAlert className="size-4" />
          <AlertTitle>{t('This token is shown only once')}</AlertTitle>
          <AlertDescription>
            {t(
              'You cannot see it again after closing this dialog. Copy it now and keep it somewhere safe.',
            )}
          </AlertDescription>
        </Alert>
        <CopyToClipboardInput textToCopy={secret} useInput={true} />
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('I have saved it')}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const handleSubmit = (values: CreatePersonalAccessTokenRequestBody) => {
    form.clearErrors('root.serverError');
    create.mutate(values, {
      onSuccess: (response) => setSecret(response.value),
      onError: (error) =>
        form.setError('root.serverError', {
          type: 'manual',
          message: serverMessage(error),
        }),
    });
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>{t('New access token')}</DialogTitle>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Token name')}</FormLabel>
              <FormControl>
                <Input {...field} maxLength={30} autoFocus />
              </FormControl>
              <FormDescription>
                {t(
                  'Describe what it is for so you can recognise it later, for example the CI release script',
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="expiry"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Expires after')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TOKEN_EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {accountUtils.expiryLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root?.serverError && (
          <FormMessage>
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={create.isPending}>
            {t('Create')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function serverMessage(error: Error): string {
  if (api.isError(error)) {
    const data = error.response?.data;
    if (
      typeof data === 'object' &&
      data !== null &&
      'params' in data &&
      typeof data.params === 'object' &&
      data.params !== null &&
      'message' in data.params &&
      typeof data.params.message === 'string'
    ) {
      return t(data.params.message);
    }
  }
  return t('Something went wrong, please try again later');
}
