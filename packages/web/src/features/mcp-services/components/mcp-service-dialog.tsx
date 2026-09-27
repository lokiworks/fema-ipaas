import {
  formErrors,
  MCP_SERVICE_MAX_TOOLS,
  McpService,
  McpServiceWithToken,
  McpToolCandidate,
  UpsertMcpServiceRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Info, Plus, Trash2 } from 'lucide-react';
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';
import { mcpServiceUtils } from '../utils/mcp-service-utils';

export function McpServiceDialog({
  open,
  onOpenChange,
  projectId,
  existing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  existing: McpService | null;
  onCreated: (service: McpServiceWithToken) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <McpServiceForm
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

function McpServiceForm({
  projectId,
  existing,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  existing: McpService | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (service: McpServiceWithToken) => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: defaultValues(existing),
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'tools',
  });
  const { data: candidates, isLoading: candidatesLoading } =
    mcpServicesHooks.useCandidates(projectId);
  const setServerError = (message: string) =>
    form.setError('root.serverError', { type: 'manual', message });
  const { mutate: create, isPending: isCreating } =
    mcpServicesHooks.useCreateMcpService({ onError: setServerError });
  const { mutate: update, isPending: isUpdating } =
    mcpServicesHooks.useUpdateMcpService({ onError: setServerError });

  const handleSubmit = (values: FormValues) => {
    form.clearErrors('root.serverError');
    const missing = values.tools.findIndex((tool) => tool.workflowId === '');
    if (missing >= 0) {
      form.setError(`tools.${missing}.workflowId`, {
        type: 'manual',
        message: formErrors.required,
      });
      return;
    }
    const request: UpsertMcpServiceRequestBody = { ...values, projectId };
    if (existing) {
      update(
        { id: existing.id, request },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }
    create(request, {
      onSuccess: (service) => {
        onOpenChange(false);
        onCreated(service);
      },
    });
  };

  const noCandidates = !candidatesLoading && (candidates ?? []).length === 0;

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>
            {existing ? t('Edit MCP service') : t('New MCP service')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Pick published workflows to expose as tools. AI assistants connected to this service can call them.',
            )}
          </DialogDescription>
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
                  maxLength={100}
                  placeholder={t('HR assistant tools')}
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
                <Textarea {...field} rows={2} maxLength={1000} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-3">
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="flex flex-col gap-0.5">
                <FormLabel>{t('Enabled')}</FormLabel>
                <FormDescription>
                  {t('When off, clients get an error for every call.')}
                </FormDescription>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('Tools')}</span>
            <span className="text-xs text-muted-foreground">
              {t('{count} of {max} tools', {
                count: fields.length,
                max: MCP_SERVICE_MAX_TOOLS,
              })}
            </span>
          </div>
          {candidatesLoading && <Skeleton className="h-20 w-full" />}
          {noCandidates && (
            <Alert>
              <Info className="size-4" />
              <AlertDescription>
                {t(
                  "Only published workflows that start with a Webhook trigger can be tools. Add a 'Return response' step so the AI gets data back.",
                )}
              </AlertDescription>
            </Alert>
          )}
          {fields.map((field, index) => (
            <ToolRow
              key={field.id}
              index={index}
              candidates={candidates ?? []}
              onRemove={() => remove(index)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={noCandidates || fields.length >= MCP_SERVICE_MAX_TOOLS}
            onClick={() => append(emptyTool())}
          >
            <Plus className="size-4 mr-1" />
            {t('Add tool')}
          </Button>
          {!noCandidates && !candidatesLoading && (
            <p className="text-xs text-muted-foreground">
              {t(
                "Only published workflows that start with a Webhook trigger can be tools. Add a 'Return response' step so the AI gets data back.",
              )}
            </p>
          )}
        </div>
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
            {existing ? t('Save changes') : t('Create')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function ToolRow({
  index,
  candidates,
  onRemove,
}: {
  index: number;
  candidates: McpToolCandidate[];
  onRemove: () => void;
}) {
  const form = useFormContext<FormValues>();
  const workflowId = useWatch({
    control: form.control,
    name: `tools.${index}.workflowId`,
  });
  const selected = candidates.find(
    (candidate) => candidate.workflowId === workflowId,
  );
  const isUnknown = workflowId !== '' && !selected;

  const selectWorkflow = (nextId: string) => {
    const next = candidates.find(
      (candidate) => candidate.workflowId === nextId,
    );
    if (!next) {
      return;
    }
    const otherNames = form
      .getValues('tools')
      .filter((_, current) => current !== index)
      .map((tool) => tool.name);
    const currentName = form.getValues(`tools.${index}.name`);
    const previousDefault = selected
      ? mcpServiceUtils.toolNameFor({
          displayName: selected.displayName,
          taken: otherNames,
        })
      : '';
    form.setValue(`tools.${index}.workflowId`, nextId, {
      shouldValidate: true,
      shouldDirty: true,
    });
    form.setValue(`tools.${index}.inputSchema`, undefined);
    if (currentName === '' || currentName === previousDefault) {
      form.setValue(
        `tools.${index}.name`,
        mcpServiceUtils.toolNameFor({
          displayName: next.displayName,
          taken: otherNames,
        }),
        { shouldValidate: true, shouldDirty: true },
      );
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-start gap-2">
        <FormField
          control={form.control}
          name={`tools.${index}.workflowId`}
          render={({ field }) => (
            <FormItem className="flex-1 min-w-0">
              <FormLabel>{t('Workflow')}</FormLabel>
              <Select
                value={field.value === '' ? undefined : field.value}
                onValueChange={selectWorkflow}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('Choose a workflow')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {isUnknown && (
                    <SelectItem value={field.value} disabled>
                      {t('Workflow no longer available')}
                    </SelectItem>
                  )}
                  {candidates.map((candidate) => (
                    <SelectItem
                      key={candidate.workflowId}
                      value={candidate.workflowId}
                      disabled={!candidate.enabled}
                    >
                      {candidateLabel(candidate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-6"
          aria-label={t('Remove tool')}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {isUnknown && (
        <p className="text-xs text-destructive">
          {t(
            'This workflow is no longer published with a Webhook trigger. Pick another workflow or remove the tool.',
          )}
        </p>
      )}
      {selected && !selected.enabled && (
        <p className="text-xs text-destructive">
          {t('This workflow is turned off, so calls to this tool will fail.')}
        </p>
      )}
      {selected && !selected.respondsWithData && (
        <p className="text-xs text-muted-foreground">
          {t(
            "This workflow has no 'Return response' step, so the AI only gets an acknowledgement back.",
          )}
        </p>
      )}
      <FormField
        control={form.control}
        name={`tools.${index}.name`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Tool name')}</FormLabel>
            <FormControl>
              <Input {...field} maxLength={64} className="font-mono" />
            </FormControl>
            <FormDescription>
              {t(
                'Letters, digits, _ and -, starting with a letter. The AI sees this name.',
              )}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`tools.${index}.description`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Description')}</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                rows={2}
                maxLength={1000}
                placeholder={t(
                  'For example: creates a Feishu account for a new hire. Input: name, email, department.',
                )}
              />
            </FormControl>
            <FormDescription>
              {t(
                'The AI reads this to decide when to call the tool and what to send. Say what it does and what input it needs.',
              )}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function candidateLabel(candidate: McpToolCandidate): string {
  if (!candidate.enabled) {
    return t('{name} (turned off)', { name: candidate.displayName });
  }
  if (!candidate.respondsWithData) {
    return t('{name} (no response data)', { name: candidate.displayName });
  }
  return candidate.displayName;
}

function defaultValues(existing: McpService | null): FormValues {
  if (!existing) {
    return { name: '', description: '', enabled: true, tools: [] };
  }
  return {
    name: existing.name,
    description: existing.description,
    enabled: existing.enabled,
    tools: existing.tools,
  };
}

function emptyTool(): FormValues['tools'][number] {
  return { workflowId: '', name: '', description: '' };
}

const FormSchema = UpsertMcpServiceRequestBody.omit({ projectId: true });

type FormValues = z.infer<typeof FormSchema>;
