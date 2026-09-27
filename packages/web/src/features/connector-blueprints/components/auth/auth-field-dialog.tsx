import {
  BLUEPRINT_LIMITS,
  BlueprintAuthField,
  BlueprintAuthFieldControl,
  blueprintRules,
  formErrors,
  unique,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { authDraftUtils } from './auth-draft-utils';

export function AuthFieldDialog({
  open,
  onOpenChange,
  initial,
  taken,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: BlueprintAuthField | null;
  taken: string[];
  onSave: (field: BlueprintAuthField) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <AuthFieldForm
          key={open ? 'open' : 'closed'}
          initial={initial}
          taken={taken}
          onSave={onSave}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function AuthFieldForm({
  initial,
  taken,
  onSave,
  onOpenChange,
}: {
  initial: BlueprintAuthField | null;
  taken: string[];
  onSave: (field: BlueprintAuthField) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<AuthFieldFormValues>({
    resolver: zodResolver(buildAuthFieldSchema({ taken })),
    mode: 'onChange',
    defaultValues: initial
      ? {
          key: initial.key,
          label: initial.label,
          control: initial.control,
          required: initial.required,
          optionsText: initial.options.join('\n'),
        }
      : {
          key: '',
          label: '',
          control: BlueprintAuthFieldControl.TEXT,
          required: true,
          optionsText: '',
        },
  });
  const control = form.watch('control');

  const handleSubmit = (values: AuthFieldFormValues) => {
    const options =
      values.control === BlueprintAuthFieldControl.DROPDOWN
        ? unique(
            values.optionsText
              .split('\n')
              .map((option) => option.trim())
              .filter((option) => option.length > 0),
          )
        : [];
    onSave({
      key: values.key,
      label: values.label.trim(),
      control: values.control,
      required: values.required,
      options,
    });
    onOpenChange(false);
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>
            {initial ? t('Edit custom field') : t('Add custom field')}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="key"
            render={({ field }) => (
              <FormItem>
                <FormLabel showRequiredIndicator>{t('Field key')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="font-mono"
                    placeholder="tenant_id"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel showRequiredIndicator>{t('Display name')}</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={BLUEPRINT_LIMITS.inputLabel} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="control"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Control')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(BlueprintAuthFieldControl).map((value) => (
                      <SelectItem key={value} value={value}>
                        {authDraftUtils.authFieldControlLabel(value)}
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
            name="required"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-1.5">
                <FormLabel>{t('Required')}</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        {control === BlueprintAuthFieldControl.DROPDOWN && (
          <FormField
            control={form.control}
            name="optionsText"
            render={({ field }) => (
              <FormItem>
                <FormLabel showRequiredIndicator>{t('Options')}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder={t('One option per line')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit">{t('Save')}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function buildAuthFieldSchema({ taken }: { taken: string[] }) {
  return z
    .object({
      key: z
        .string()
        .trim()
        .min(1, formErrors.required)
        .max(BLUEPRINT_LIMITS.key, 'Field key must be 64 characters or fewer')
        .refine((value) => blueprintRules.isValidFieldKey(value), {
          error:
            'Start with a letter or underscore, and use only letters, digits and underscores',
        })
        .refine((value) => !taken.includes(value), {
          error: 'This field key is already used',
        }),
      label: z
        .string()
        .trim()
        .min(1, formErrors.required)
        .max(
          BLUEPRINT_LIMITS.inputLabel,
          'Display name must be 30 characters or fewer',
        ),
      control: z.enum(BlueprintAuthFieldControl),
      required: z.boolean(),
      optionsText: z.string(),
    })
    .refine(
      (values) =>
        values.control !== BlueprintAuthFieldControl.DROPDOWN ||
        values.optionsText
          .split('\n')
          .some((option) => option.trim().length > 0),
      { error: 'Enter at least one option', path: ['optionsText'] },
    );
}

type AuthFieldFormValues = z.infer<ReturnType<typeof buildAuthFieldSchema>>;
