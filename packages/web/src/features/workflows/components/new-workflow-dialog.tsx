import {
  formErrors,
  PopulatedWorkflow,
  ProjectDirectoryItem,
  ProjectTree,
  WorkflowOperationType,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import i18next, { t } from 'i18next';
import {
  AlarmClock,
  AppWindow,
  ClipboardList,
  Globe,
  LucideIcon,
  MousePointerClick,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { MessageTooltip } from '@/components/custom/message-tooltip';
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
import { SkeletonList } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { GenerateWorkflowDialog } from '@/features/ai';
import {
  connectorsApi,
  connectorSelectorUtils,
  stepUtils,
} from '@/features/connectors';
import {
  PROJECT_DIRECTORY_QUERY_KEY,
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { workflowsApi } from '../api/workflows-api';
import {
  APP_EVENT_TRIGGER,
  NEW_WORKFLOW_TRIGGER_CHOICES,
  newWorkflowTriggerUtils,
} from '../utils/new-workflow-triggers';

export function NewWorkflowDialog({
  open,
  onOpenChange,
  projectId,
  folderId,
  pickProject = false,
}: NewWorkflowDialogProps) {
  const [aiTarget, setAiTarget] = useState<string | null>(null);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <NewWorkflowFormLoader
            key={open ? 'open' : 'closed'}
            projectId={projectId}
            folderId={folderId}
            pickProject={pickProject}
            onOpenChange={onOpenChange}
            onSwitchToAi={(target) => {
              onOpenChange(false);
              setAiTarget(target);
            }}
          />
        </DialogContent>
      </Dialog>
      <GenerateWorkflowDialog
        open={aiTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setAiTarget(null);
          }
        }}
        projectId={aiTarget ?? undefined}
      />
    </>
  );
}

function NewWorkflowFormLoader(props: NewWorkflowFormProps) {
  const { data: directory, isLoading } = projectDirectoryHooks.useDirectory();
  if (isLoading) {
    return <SkeletonList numberOfItems={4} className="h-10" />;
  }
  return (
    <NewWorkflowForm
      {...props}
      editable={(directory ?? []).filter(projectDirectoryUtils.canEdit)}
    />
  );
}

function NewWorkflowForm({
  projectId,
  folderId,
  pickProject,
  onOpenChange,
  onSwitchToAi,
  editable,
}: NewWorkflowFormProps & { editable: ProjectDirectoryItem[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const form = useForm<NewWorkflowValues>({
    resolver: zodResolver(NewWorkflowSchema),
    mode: 'onChange',
    defaultValues: defaultValues({
      projectId:
        projectId ??
        pickDefaultProjectId({
          editable,
          currentProjectId: authenticationSession.getProjectId(),
        }),
    }),
  });
  const targetId = form.watch('projectId');
  const typedName = form.watch('displayName').trim();
  const { data: tree } = useQuery({
    queryKey: ['new-workflow-project-tree', targetId],
    queryFn: () => fetchProjectTree(targetId),
    enabled: targetId.length > 0,
    retry: false,
  });
  const nameTaken =
    typedName.length > 0 &&
    (tree?.workflows ?? []).some(
      (workflow) => workflow.displayName.trim() === typedName,
    );
  const target = editable.find((project) => project.id === targetId);
  const isFull = target ? projectDirectoryUtils.isFull(target) : false;
  const canAi = Boolean(targetId) && !isFull;

  const handleSubmit = async (values: NewWorkflowValues) => {
    form.clearErrors('root.serverError');
    const displayName = values.displayName.trim();
    if (nameTaken) {
      form.setError('displayName', {
        type: 'manual',
        message: 'workflowNameTaken',
      });
      return;
    }
    setIsCreating(true);
    try {
      const description = values.description.trim();
      const workflow = await workflowsApi.create({
        projectId: values.projectId,
        displayName,
        folderId,
        metadata: description.length > 0 ? { description } : undefined,
      });
      await applyTrigger({
        workflow,
        projectId: values.projectId,
        trigger: values.trigger,
      });
      queryClient.invalidateQueries({ queryKey: PROJECT_DIRECTORY_QUERY_KEY });
      onOpenChange(false);
      navigate(`/projects/${values.projectId}/workflows/${workflow.id}`);
    } catch (error) {
      setIsCreating(false);
      form.setError('root.serverError', {
        type: 'manual',
        message: api.extractServerErrorMessage(
          error,
          t('Something went wrong'),
        ),
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('New workflow')}</DialogTitle>
        <DialogDescription>
          {t('Name the workflow and choose what starts it.')}
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <Sparkles className="size-4 shrink-0 text-primary" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">
            {t('Rather not start from scratch? Describe it in one sentence')}
          </span>
          <span className="text-xs text-muted-foreground">
            {t(
              'AI drafts the steps, connections and field mappings for you to review and keep editing',
            )}
          </span>
        </div>
        <MessageTooltip
          isDisabled={!canAi}
          message="You have no editable project yet. Create a project first."
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAi}
            onClick={() => onSwitchToAi(targetId)}
          >
            <Sparkles className="size-4 mr-1" />
            {t('Generate with AI')}
          </Button>
        </MessageTooltip>
      </div>
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(handleSubmit)}
        >
          {pickProject && (
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Project')}</FormLabel>
                  {editable.length === 0 ? (
                    <Alert variant="warning">
                      <AlertDescription>
                        {t(
                          'You have no editable project yet. Create a project first.',
                        )}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('Select a project')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {editable.map((project) => (
                          <SelectItem
                            key={project.id}
                            value={project.id}
                            disabled={projectDirectoryUtils.isFull(project)}
                          >
                            {projectDirectoryUtils.isFull(project)
                              ? t('{name} (workflow limit reached)', {
                                  name: project.displayName,
                                })
                              : project.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormDescription>
                    {t('Only projects you can edit are listed')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {isFull && (
            <Alert variant="warning">
              <AlertDescription>
                {t(
                  'This project has reached its workflow limit. Remove a workflow or ask the owner to raise the limit.',
                )}
              </AlertDescription>
            </Alert>
          )}
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Workflow name')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoFocus
                    maxLength={WORKFLOW_NAME_MAX_LENGTH}
                    placeholder={t(
                      'For example: send a Feishu message after an approval passes',
                    )}
                  />
                </FormControl>
                <FormMessage />
                {nameTaken && !form.formState.errors.displayName && (
                  <p className="text-sm text-destructive">
                    {t('workflowNameTaken')}
                  </p>
                )}
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
                    rows={2}
                    maxLength={WORKFLOW_DESCRIPTION_MAX_LENGTH}
                    placeholder={t(
                      'Explain what this workflow does so the team understands it',
                    )}
                  />
                </FormControl>
                <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                  <FormMessage />
                  <span className="ml-auto">
                    {t('{count} / {max}', {
                      count: field.value.length,
                      max: WORKFLOW_DESCRIPTION_MAX_LENGTH,
                    })}
                  </span>
                </div>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="trigger"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Trigger')}</FormLabel>
                <FormDescription>
                  {t(
                    'Choose what starts the workflow. You can replace the trigger in the editor later.',
                  )}
                </FormDescription>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {NEW_WORKFLOW_TRIGGER_CHOICES.map((choice) => (
                    <TriggerCard
                      key={choice.value}
                      icon={TRIGGER_ICONS[choice.value] ?? Zap}
                      label={t(choice.labelKey)}
                      description={t(choice.descriptionKey)}
                      selected={field.value === choice.value}
                      onSelect={() => field.onChange(choice.value)}
                    />
                  ))}
                </div>
                <span className="pt-2 text-xs text-muted-foreground">
                  {t('Or start the workflow from an app event')}
                </span>
                <TriggerCard
                  icon={AppWindow}
                  label={t('App event')}
                  description={t(
                    'Pick the app and its event in the editor after creating',
                  )}
                  selected={field.value === APP_EVENT_TRIGGER}
                  onSelect={() => field.onChange(APP_EVENT_TRIGGER)}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          {form.formState.errors.root?.serverError && (
            <p className="text-sm text-destructive">
              {t(form.formState.errors.root.serverError.message ?? '')}
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
            <Button
              type="submit"
              loading={isCreating}
              disabled={isCreating || !targetId || isFull || nameTaken}
            >
              {t('Create')}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </div>
  );
}

function TriggerCard({
  icon: Icon,
  label,
  description,
  selected,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/60',
        selected && 'border-primary bg-primary/5',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function defaultValues({
  projectId,
}: {
  projectId: string | undefined;
}): NewWorkflowValues {
  return {
    projectId: projectId ?? '',
    displayName: '',
    description: '',
    trigger: NEW_WORKFLOW_TRIGGER_CHOICES[0].value,
  };
}

function pickDefaultProjectId({
  editable,
  currentProjectId,
}: {
  editable: ProjectDirectoryItem[];
  currentProjectId: string | null;
}): string | undefined {
  const roomy = editable.filter(
    (project) => !projectDirectoryUtils.isFull(project),
  );
  return (
    roomy.find((project) => project.id === currentProjectId)?.id ??
    roomy[0]?.id ??
    editable[0]?.id
  );
}

async function fetchProjectTree(projectId: string): Promise<ProjectTree> {
  return api.get<ProjectTree>('/v1/project-workspace/tree', { projectId });
}

async function applyTrigger({
  workflow,
  projectId,
  trigger,
}: {
  workflow: PopulatedWorkflow;
  projectId: string;
  trigger: string;
}): Promise<void> {
  const target = newWorkflowTriggerUtils.targetFor(trigger);
  if (target === null) {
    return;
  }
  const connector = await connectorsApi.get({
    name: target.connectorName,
    projectId,
    locale: i18next.language,
  });
  const triggerMetadata = connector.triggers[target.triggerName];
  if (!triggerMetadata) {
    return;
  }
  const step = connectorSelectorUtils.getDefaultStepValues({
    stepName: 'trigger',
    connectorSelectorItem: {
      type: WorkflowTriggerType.CONNECTOR,
      actionOrTrigger: triggerMetadata,
      connectorMetadata: stepUtils.mapConnectorToMetadata({
        connector,
        type: 'trigger',
      }),
    },
  });
  if (step.type !== WorkflowTriggerType.CONNECTOR) {
    return;
  }
  await workflowsApi.update(workflow.id, {
    type: WorkflowOperationType.UPDATE_TRIGGER,
    request: step,
  });
}

const WORKFLOW_NAME_MAX_LENGTH = 100;
const WORKFLOW_DESCRIPTION_MAX_LENGTH = 300;

const TRIGGER_ICONS: Record<string, LucideIcon> = {
  webhook: Globe,
  manual: MousePointerClick,
  schedule: AlarmClock,
  subflow: Zap,
  form: ClipboardList,
};

const NewWorkflowSchema = z.object({
  projectId: z.string().min(1, formErrors.required),
  displayName: z
    .string()
    .trim()
    .min(1, formErrors.required)
    .max(WORKFLOW_NAME_MAX_LENGTH, 'workflowNameTooLong'),
  description: z
    .string()
    .max(WORKFLOW_DESCRIPTION_MAX_LENGTH, 'workflowDescriptionTooLong'),
  trigger: z.string().min(1, formErrors.required),
});

type NewWorkflowValues = z.infer<typeof NewWorkflowSchema>;

type NewWorkflowFormProps = {
  projectId?: string;
  folderId?: string;
  pickProject: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchToAi: (projectId: string) => void;
};

export type NewWorkflowDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  folderId?: string;
  pickProject?: boolean;
};
