import { MappingMissingBehavior } from '@fema-ipaas/core-utils';
import { WorkflowPlan, formErrors } from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { mappingTablesHooks } from '@/features/mapping-tables';

import { aiUtils } from '../utils/ai-utils';

export function PlanMappingTableDialog({
  open,
  onOpenChange,
  hint,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hint: MappingTableHint;
  projectId: string;
  onCreated: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <PlanMappingTableForm
          key={open ? 'open' : 'closed'}
          hint={hint}
          projectId={projectId}
          onCancel={() => onOpenChange(false)}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

function PlanMappingTableForm({
  hint,
  projectId,
  onCancel,
  onCreated,
}: {
  hint: MappingTableHint;
  projectId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const form = useForm<MappingTableValues>({
    resolver: zodResolver(MappingTableSchema),
    mode: 'onChange',
    defaultValues: { name: hint.name, rows: '' },
  });
  const { mutate: save, isPending } = mappingTablesHooks.useSaveMappingTable();
  const submit = form.handleSubmit((values) => {
    const parsed = aiUtils.parseMappingRows(values.rows);
    if (parsed.brokenLine !== null) {
      form.setError('rows', {
        type: 'manual',
        message: t('Line {line} needs a key and a value separated by a comma', {
          line: parsed.brokenLine,
        }),
      });
      return;
    }
    save(
      {
        id: null,
        request: {
          projectId,
          name: values.name.trim(),
          description: '',
          keyLabel: hint.keyLabel,
          valueLabel: hint.valueLabel,
          missingBehavior: MappingMissingBehavior.ERROR,
          defaultValue: null,
          rows: parsed.rows,
        },
      },
      { onSuccess: onCreated },
    );
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('Create department mapping table')}</DialogTitle>
        <DialogDescription>
          {t(
            'It maps {key} to {value}. A department that is missing from the table fails the run with a clear reason, so nobody ends up in the wrong department.',
            { key: hint.keyLabel, value: hint.valueLabel },
          )}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void submit();
          }}
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Table name')}</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={TABLE_NAME_MAX_LENGTH} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rows"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Rows')}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={6}
                    placeholder={`${hint.keyLabel}, ${hint.valueLabel}\n20301, od-rd`}
                  />
                </FormControl>
                <span className="text-xs text-muted-foreground">
                  {t(
                    'One pair per line, separated by a comma. You can leave it empty and fill it in on the Mapping tables page later.',
                  )}
                </span>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={isPending}>
              {t('Create and plan again')}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

const TABLE_NAME_MAX_LENGTH = 30;

const MappingTableSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, formErrors.required)
    .max(TABLE_NAME_MAX_LENGTH, 'mappingTableNameTooLong'),
  rows: z.string(),
});

type MappingTableValues = z.infer<typeof MappingTableSchema>;
type MappingTableHint = NonNullable<WorkflowPlan['missingMappingTable']>;
