import {
  BLUEPRINT_LIMITS,
  blueprintFactory,
  BlueprintHttpMethod,
  blueprintRules,
  BlueprintTriggerType,
  ConnectorBlueprintDetail,
  isNil,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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
import { cn } from '@/lib/utils';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';
import { blueprintWorkspaceUtils } from '../../utils/blueprint-workspace-utils';

export function NewOperationDialog({
  detail,
  group,
  open,
  onOpenChange,
}: {
  detail: ConnectorBlueprintDetail;
  group: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <NewOperationForm
          key={open ? `open-${group}` : 'closed'}
          detail={detail}
          group={group}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewOperationForm({
  detail,
  group,
  onDone,
}: {
  detail: ConnectorBlueprintDetail;
  group: string;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const taken = blueprintWorkspaceUtils.takenOperationKeys(detail);
  const groups = blueprintWorkspaceUtils.groupNames(detail.definition);
  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a name')
      .max(BLUEPRINT_LIMITS.name, 'Name must be 30 characters or fewer'),
    key: z
      .string()
      .refine(
        (key) => blueprintRules.isValidKey(key),
        'Start with a lowercase letter and use only lowercase letters, digits and underscores',
      )
      .refine(
        (key) => !taken.includes(key),
        'This identifier is used by another operation, including deleted operations that are not published yet',
      ),
    method: z.enum(BlueprintHttpMethod),
    path: z
      .string()
      .refine((path) => path.startsWith('/'), 'The path must start with /'),
    group: z
      .string()
      .max(BLUEPRINT_LIMITS.group, 'Group must be 20 characters or fewer'),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      key: '',
      method: BlueprintHttpMethod.POST,
      path: '/',
      group,
    },
  });
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({
      id: detail.id,
      onError: (error) =>
        form.setError('root.serverError', {
          type: 'manual',
          message: api.extractServerErrorMessage(
            error,
            t('Failed to save the connector'),
          ),
        }),
    });

  const submit = form.handleSubmit((values) => {
    const operation = blueprintFactory.operation({
      key: values.key,
      name: values.name.trim(),
      method: values.method,
      path: values.path.trim(),
      group: values.group.trim(),
    });
    mutate(
      {
        definition: {
          ...detail.definition,
          operations: [...detail.definition.operations, operation],
        },
      },
      {
        onSuccess: () => {
          toast.success(
            t('Operation created, configure its inputs and API next'),
          );
          onDone();
          navigate(
            `/tenant/connectors/development/${detail.id}/op/${operation.key}`,
          );
        },
      },
    );
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{t('New operation')}</DialogTitle>
          <DialogDescription>
            {t('An operation is one API that workflows can call')}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Operation name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoFocus
                  maxLength={BLUEPRINT_LIMITS.name}
                  placeholder={t('For example: Create ticket')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Operation identifier')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="font-mono"
                  placeholder="create_ticket"
                  onChange={(event) =>
                    field.onChange(event.target.value.trim())
                  }
                />
              </FormControl>
              <FormDescription>
                {t(
                  'Cannot be changed after creation. Workflows refer to the operation by it',
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <FormField
            control={form.control}
            name="method"
            render={({ field }) => (
              <FormItem className="w-32">
                <FormLabel>{t('Request')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(BlueprintHttpMethod).map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="path"
            render={({ field }) => (
              <FormItem className="grow">
                <FormLabel>{t('Request path')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="font-mono"
                    placeholder="/tickets"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="group"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Group')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  maxLength={BLUEPRINT_LIMITS.group}
                  placeholder={t('Ungrouped')}
                />
              </FormControl>
              {groups.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => field.onChange(name)}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-xs',
                        field.value === name && 'border-primary text-primary',
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
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
          <Button type="button" variant="outline" onClick={onDone}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Create')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function NewTriggerDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: ConnectorBlueprintDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <NewTriggerForm
          key={open ? 'open' : 'closed'}
          detail={detail}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewTriggerForm({
  detail,
  onDone,
}: {
  detail: ConnectorBlueprintDetail;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const taken = blueprintWorkspaceUtils.takenTriggerKeys(detail);
  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a name')
      .max(BLUEPRINT_LIMITS.name, 'Name must be 30 characters or fewer'),
    key: z
      .string()
      .refine(
        (key) => blueprintRules.isValidKey(key),
        'Start with a lowercase letter and use only lowercase letters, digits and underscores',
      )
      .refine(
        (key) => !taken.includes(key),
        'This identifier is used by another trigger',
      ),
    type: z.enum(BlueprintTriggerType),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', key: '', type: BlueprintTriggerType.INSTANT },
  });
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({
      id: detail.id,
      onError: (error) =>
        form.setError('root.serverError', {
          type: 'manual',
          message: api.extractServerErrorMessage(
            error,
            t('Failed to save the connector'),
          ),
        }),
    });
  const submit = form.handleSubmit((values) => {
    const trigger = blueprintFactory.trigger({
      key: values.key,
      name: values.name.trim(),
      type: values.type,
    });
    mutate(
      {
        definition: {
          ...detail.definition,
          triggers: [...detail.definition.triggers, trigger],
        },
      },
      {
        onSuccess: () => {
          toast.success(t('Trigger created'));
          onDone();
          navigate(
            `/tenant/connectors/development/${detail.id}/trigger/${trigger.key}`,
          );
        },
      },
    );
  });
  const typeOptions = [
    {
      value: BlueprintTriggerType.INSTANT,
      label: t('Instant trigger'),
      description: t('The service pushes events and runs start immediately'),
    },
    {
      value: BlueprintTriggerType.POLLING,
      label: t('Polling trigger'),
      description: t('The platform calls an API periodically to find new data'),
    },
  ];

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{t('New trigger')}</DialogTitle>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Trigger name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoFocus
                  maxLength={BLUEPRINT_LIMITS.name}
                  placeholder={t('For example: Ticket status changed')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Unique identifier')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="font-mono"
                  placeholder="ticket_updated"
                  onChange={(event) =>
                    field.onChange(event.target.value.trim())
                  }
                />
              </FormControl>
              <FormDescription>
                {t('Cannot be changed after creation')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Trigger type')}</FormLabel>
              <div className="grid grid-cols-2 gap-2">
                {typeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => field.onChange(option.value)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-md border p-3 text-left',
                      field.value === option.value &&
                        'border-primary ring-1 ring-primary',
                    )}
                  >
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </FormItem>
          )}
        />
        {form.formState.errors.root?.serverError && (
          <p className="text-sm text-destructive">
            {form.formState.errors.root.serverError.message}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Create')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function GroupDialog({
  detail,
  from,
  open,
  onOpenChange,
}: {
  detail: ConnectorBlueprintDetail;
  from: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <GroupForm
          key={open ? `open-${from ?? ''}` : 'closed'}
          detail={detail}
          from={from}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function GroupForm({
  detail,
  from,
  onDone,
}: {
  detail: ConnectorBlueprintDetail;
  from: string | null;
  onDone: () => void;
}) {
  const others = blueprintWorkspaceUtils
    .groupNames(detail.definition)
    .filter((name) => name !== from);
  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a name')
      .max(BLUEPRINT_LIMITS.group, 'Group must be 20 characters or fewer')
      .refine(
        (name) => name !== UNGROUPED_RESERVED,
        'Ungrouped is a reserved name',
      )
      .refine(
        (name) => !others.includes(name),
        'A group with this name already exists',
      ),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: from ?? '' },
  });
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({
      id: detail.id,
      onSuccess: () => {
        toast.success(isNil(from) ? t('Group created') : t('Group renamed'));
        onDone();
      },
    });
  const submit = form.handleSubmit((values) => {
    const name = values.name.trim();
    const definition = isNil(from)
      ? blueprintWorkspaceUtils.addGroup({
          definition: detail.definition,
          name,
        })
      : blueprintWorkspaceUtils.renameGroup({
          definition: detail.definition,
          from,
          to: name,
        });
    mutate({ definition });
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>
            {isNil(from) ? t('New group') : t('Rename group')}
          </DialogTitle>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Group name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoFocus
                  maxLength={BLUEPRINT_LIMITS.group}
                />
              </FormControl>
              <FormDescription>
                {t('Groups organise operations in the node panel')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {isNil(from) ? t('Create') : t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const UNGROUPED_RESERVED = '未分组';
