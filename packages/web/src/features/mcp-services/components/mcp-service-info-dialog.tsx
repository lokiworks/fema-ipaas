import {
  CreateMcpServiceRequestBody,
  MCP_SERVICE_KEY_MAX_LENGTH,
  McpService,
  UpdateMcpServiceInfoRequestBody,
} from '@fema-ipaas/shared';
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
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';

function McpCreateServiceDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (service: McpService) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <CreateForm
          key={open ? 'open' : 'closed'}
          projectId={projectId}
          onOpenChange={onOpenChange}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({
  projectId,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (service: McpService) => void;
}) {
  const form = useForm<CreateMcpServiceRequestBody>({
    resolver: zodResolver(CreateMcpServiceRequestBody),
    mode: 'onChange',
    defaultValues: { projectId, name: '', key: '', description: '' },
  });
  const setServerError = (message: string) =>
    form.setError('root.serverError', { type: 'manual', message });
  const { mutate: create, isPending } = mcpServicesHooks.useCreateService({
    onError: setServerError,
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => {
          form.clearErrors('root.serverError');
          create(values, { onSuccess: onCreated });
        })}
      >
        <DialogHeader>
          <DialogTitle>{t('Create MCP service')}</DialogTitle>
          <DialogDescription>
            {t(
              'Package connector actions and published workflows so AI assistants can call them.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Service name')}</FormLabel>
              <FormControl>
                <Input {...field} maxLength={30} autoFocus />
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
              <FormLabel>{t('Unique key')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  maxLength={MCP_SERVICE_KEY_MAX_LENGTH}
                  className="font-mono"
                  placeholder="hr-toolkit"
                />
              </FormControl>
              <FormDescription>
                {t(
                  'Used in the service URL, starts with a lowercase letter, cannot be changed after creation.',
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Description')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  maxLength={300}
                  placeholder={t(
                    'For example: let the AI look up employee info or approval progress',
                  )}
                />
              </FormControl>
              <FormDescription>
                {t('The AI uses this to decide when to use this service.')}
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
            {t('Create')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function McpEditInfoDialog({
  service,
  open,
  onOpenChange,
}: {
  service: McpService;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <EditForm
          key={open ? 'open' : 'closed'}
          service={service}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  service,
  onOpenChange,
}: {
  service: McpService;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<UpdateMcpServiceInfoRequestBody>({
    resolver: zodResolver(UpdateMcpServiceInfoRequestBody),
    mode: 'onChange',
    defaultValues: { name: service.name, description: service.description },
  });
  const setServerError = (message: string) =>
    form.setError('root.serverError', { type: 'manual', message });
  const { mutate: updateInfo, isPending } = mcpServicesHooks.useUpdateInfo({
    id: service.id,
    onError: setServerError,
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => {
          form.clearErrors('root.serverError');
          updateInfo(values, { onSuccess: () => onOpenChange(false) });
        })}
      >
        <DialogHeader>
          <DialogTitle>{t('Edit service info')}</DialogTitle>
          <DialogDescription className="font-mono">
            {service.key}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Service name')}</FormLabel>
              <FormControl>
                <Input {...field} maxLength={30} autoFocus />
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
              <FormLabel>{t('Description')}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} maxLength={300} />
              </FormControl>
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

export { McpCreateServiceDialog, McpEditInfoDialog };
