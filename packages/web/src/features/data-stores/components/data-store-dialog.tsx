import {
  DATA_STORE_DEFAULT_TTL_DAYS,
  DATA_STORE_DESCRIPTION_MAX_LENGTH,
  DATA_STORE_MAX_TTL_DAYS,
  DATA_STORE_MIN_TTL_DAYS,
  DATA_STORE_NAME_MAX_LENGTH,
  DataStore,
  UpdateDataStoreRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

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
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

import { dataStoresHooks } from '../hooks/data-stores-hooks';

export function DataStoreDialog({
  open,
  onOpenChange,
  projectId,
  existing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  existing: DataStore | null;
  onCreated: (store: DataStore) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DataStoreForm
          key={open ? `${existing?.id ?? 'new'}-open` : 'closed'}
          projectId={projectId}
          existing={existing}
          onOpenChange={onOpenChange}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

function DataStoreForm({
  projectId,
  existing,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  existing: DataStore | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (store: DataStore) => void;
}) {
  const form = useForm<UpdateDataStoreRequestBody>({
    resolver: zodResolver(UpdateDataStoreRequestBody),
    mode: 'onChange',
    defaultValues: defaultValues(existing),
  });
  const onError = (error: Error) => {
    const message = api.extractServerErrorMessage(
      error,
      t('Something went wrong'),
    );
    if (message === NAME_TAKEN_ERROR) {
      form.setError('name', { type: 'manual', message });
      return;
    }
    form.setError('root.serverError', { type: 'manual', message: t(message) });
  };
  const { mutate: create, isPending: isCreating } =
    dataStoresHooks.useCreateDataStore({ onError });
  const { mutate: update, isPending: isUpdating } =
    dataStoresHooks.useUpdateDataStore({ onError });

  const handleSubmit = (values: UpdateDataStoreRequestBody) => {
    form.clearErrors('root.serverError');
    if (existing) {
      update(
        { id: existing.id, request: values },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }
    create(
      { ...values, projectId },
      {
        onSuccess: (store) => {
          onOpenChange(false);
          onCreated(store);
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>
            {existing ? t('Edit data store') : t('New data store')}
          </DialogTitle>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoFocus
                  maxLength={DATA_STORE_NAME_MAX_LENGTH}
                  placeholder={t('dataStoreNamePlaceholder')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Description (optional)')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={2}
                  maxLength={DATA_STORE_DESCRIPTION_MAX_LENGTH}
                  placeholder={t('dataStoreDescriptionPlaceholder')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="ttlDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Data retention')}</FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Input
                    type="number"
                    className="w-32"
                    min={DATA_STORE_MIN_TTL_DAYS}
                    max={DATA_STORE_MAX_TTL_DAYS}
                    step={1}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={Number.isNaN(field.value) ? '' : field.value}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ''
                          ? Number.NaN
                          : Number(event.target.value),
                      )
                    }
                  />
                </FormControl>
                <span className="text-sm text-muted-foreground">
                  {t('days')}
                </span>
              </div>
              <FormDescription>
                {existing
                  ? t('dataStoreTtlHintEdit')
                  : t('dataStoreTtlHintCreate')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root?.serverError && (
          <p className="text-sm text-destructive">
            {form.formState.errors.root.serverError.message}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isCreating || isUpdating}>
            {t('Confirm')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function defaultValues(existing: DataStore | null): UpdateDataStoreRequestBody {
  return {
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    ttlDays: existing?.ttlDays ?? DATA_STORE_DEFAULT_TTL_DAYS,
  };
}

const NAME_TAKEN_ERROR = 'dataStoreNameTaken';
