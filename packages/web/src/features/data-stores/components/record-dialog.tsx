import {
  DATA_STORE_VALUE_MAX_LENGTH,
  DataStore,
  DataStoreRecord,
  DataStoreRecordWriteMode,
  STORE_KEY_MAX_LENGTH,
  UpsertDataStoreRecordRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
import { dataStoreUtils } from '../utils/data-store-utils';

export function RecordDialog({
  open,
  onOpenChange,
  store,
  record,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: DataStore;
  record: DataStoreRecord | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <RecordForm
          key={open ? `${record?.key ?? 'new'}-open` : 'closed'}
          store={store}
          record={record}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function RecordForm({
  store,
  record,
  onOpenChange,
}: {
  store: DataStore;
  record: DataStoreRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<UpsertDataStoreRecordRequestBody>({
    resolver: zodResolver(UpsertDataStoreRecordRequestBody),
    mode: 'onChange',
    defaultValues: defaultValues(record),
  });
  const { mutate: upsert, isPending } = dataStoresHooks.useUpsertRecord({
    onError: (error) => {
      const message = api.extractServerErrorMessage(
        error,
        t('Something went wrong'),
      );
      if (message === KEY_EXISTS_ERROR) {
        form.setError('key', { type: 'manual', message });
        return;
      }
      form.setError('root.serverError', {
        type: 'manual',
        message: t(message),
      });
    },
  });
  const valueLength = form.watch('value').length;

  const handleSubmit = (values: UpsertDataStoreRecordRequestBody) => {
    form.clearErrors('root.serverError');
    upsert(
      { id: store.id, request: values },
      {
        onSuccess: () => {
          toast.success(record ? t('Saved') : t('Record created'));
          onOpenChange(false);
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
            {record ? t('Edit record') : t('New record')}
          </DialogTitle>
        </DialogHeader>
        <FormField
          control={form.control}
          name="key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('dataStoreKeyLabel')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="font-mono"
                  autoFocus={record === null}
                  readOnly={record !== null}
                  maxLength={STORE_KEY_MAX_LENGTH}
                  placeholder={t('dataStoreKeyPlaceholder')}
                />
              </FormControl>
              <FormDescription>
                {record
                  ? t('Keys cannot be changed after creation')
                  : t('Keys must be unique within this data store')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Value')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={6}
                  className="font-mono text-xs"
                  maxLength={DATA_STORE_VALUE_MAX_LENGTH}
                  placeholder={t('Text or JSON')}
                />
              </FormControl>
              <FormDescription className="flex justify-between gap-2">
                <span>
                  {t('Expires {days} days after saving', {
                    days: store.ttlDays,
                  })}
                </span>
                <span>
                  {valueLength}/{DATA_STORE_VALUE_MAX_LENGTH}
                </span>
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
          <Button type="submit" loading={isPending}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function defaultValues(
  record: DataStoreRecord | null,
): UpsertDataStoreRecordRequestBody {
  if (record === null) {
    return { mode: DataStoreRecordWriteMode.CREATE, key: '', value: '' };
  }
  return {
    mode: DataStoreRecordWriteMode.UPDATE,
    key: record.key,
    value: dataStoreUtils.displayValue(record.value),
  };
}

const KEY_EXISTS_ERROR = 'dataStoreKeyExists';
