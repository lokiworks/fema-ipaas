import {
  AI_PROMPT_MAX_LENGTH,
  GenerateWorkflowPlanRequestBody,
  PlanAnswer,
  PlanTemplate,
  ProjectDirectoryItem,
  WorkflowPlan,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import {
  CircleAlert,
  ListChecks,
  Plug,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CharacterCounter } from '@/features/project-workspace/components/character-counter';
import { projectDirectoryHooks } from '@/features/projects/api/project-directory-api';
import { authenticationSession } from '@/lib/authentication-session';

import { aiHooks } from '../hooks/ai-hooks';
import { aiUtils } from '../utils/ai-utils';

import { PlanModelField } from './plan-model-field';
import { PlanReview } from './plan-review';

export function GenerateWorkflowButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => setOpen(true)}
      >
        <WandSparkles className="size-4 mr-1" />
        {t('Create with AI')}
      </Button>
      <GenerateWorkflowDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function GenerateWorkflowDialog({
  open,
  onOpenChange,
  initialPrompt,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  projectId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-5xl">
        <GenerateWorkflowForm
          key={open ? 'open' : 'closed'}
          onOpenChange={onOpenChange}
          initialPrompt={initialPrompt}
          targetProjectId={projectId}
        />
      </DialogContent>
    </Dialog>
  );
}

function GenerateWorkflowForm({
  onOpenChange,
  initialPrompt,
  targetProjectId,
}: {
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  targetProjectId?: string;
}) {
  const [chosenProjectId, setChosenProjectId] = useState<string | null>(null);
  const projectId =
    chosenProjectId ??
    targetProjectId ??
    authenticationSession.getProjectId() ??
    '';
  const navigate = useNavigate();
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const models = aiHooks.usePlanModelSelection(projectId);
  const [plan, setPlan] = useState<WorkflowPlan | null>(null);
  const [plannedPrompt, setPlannedPrompt] = useState('');
  const [plannedWithModel, setPlannedWithModel] = useState(false);
  const [planCount, setPlanCount] = useState(0);
  const [answerLog, setAnswerLog] = useState<PlanAnswer[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const form = useForm<PromptValues>({
    resolver: zodResolver(PromptSchema),
    mode: 'onChange',
    defaultValues: defaultPromptValues(initialPrompt),
  });
  const { mutate: generate, isPending: isPlanning } = aiHooks.useGeneratePlan({
    onError: (message) =>
      form.setError('root.serverError', { type: 'manual', message }),
  });
  const { mutate: apply, isPending: isCreating } = aiHooks.useApplyPlan();
  const prompt = form.watch('prompt');
  const isStale = plan !== null && prompt.trim() !== plannedPrompt;
  const openCount = plan
    ? aiUtils.openQuestions({ plan, answered: answerLog }).length
    : 0;
  const hasPlanError = form.formState.errors.root?.serverError !== undefined;
  const modelFailed = hasPlanError && !models.usesRules && !isPlanning;
  const { data: closestTemplates } = aiHooks.usePlanTemplates({
    projectId,
    prompt: prompt.trim(),
    enabled: hasPlanError && !isPlanning,
  });

  const requestPlan = ({
    values,
    answers,
    withModel,
    nextExcluded = excluded,
  }: {
    values: PromptValues;
    answers: PlanAnswer[];
    withModel: boolean;
    nextExcluded?: string[];
  }) => {
    form.clearErrors('root.serverError');
    if (models.isLoading) {
      return;
    }
    const nextLog = aiUtils.mergeAnswers({
      previous: answerLog,
      next: answers,
    });
    const modelId = withModel ? models.selectedId : null;
    generate(
      {
        projectId,
        ...(modelId === null ? {} : { modelConnectionExternalId: modelId }),
        prompt: values.prompt,
        answers: nextLog,
        ...(nextExcluded.length === 0 ? {} : { excludedSteps: nextExcluded }),
      },
      {
        onSuccess: (next) => {
          setPlan(next);
          setAnswerLog(nextLog);
          setExcluded(nextExcluded);
          setPlannedPrompt(values.prompt.trim());
          setPlannedWithModel(modelId !== null);
          setPlanCount((count) => count + 1);
        },
      },
    );
  };

  const submitPlan = () =>
    form.handleSubmit((values) =>
      requestPlan({ values, answers: [], withModel: true }),
    )();

  const submitRef = useRef(submitPlan);
  submitRef.current = submitPlan;
  const autoPlanned = useRef(false);
  useEffect(() => {
    if (
      !autoPlanned.current &&
      (initialPrompt ?? '').trim().length > 0 &&
      !models.isLoading &&
      projectId !== ''
    ) {
      autoPlanned.current = true;
      submitRef.current();
    }
  }, [initialPrompt, models.isLoading, projectId]);

  const createDraft = (current: WorkflowPlan) =>
    apply(
      { projectId, plan: current },
      {
        onSuccess: ({ workflowId }) => {
          onOpenChange(false);
          navigate(`/projects/${projectId}/workflows/${workflowId}`);
        },
      },
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('Create with AI')}</DialogTitle>
        <DialogDescription>
          {t(
            'Describe what should happen. AI drafts the trigger and steps, and you review them in the editor before publishing.',
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:overflow-visible">
        <div className="flex flex-col gap-4 lg:overflow-y-auto lg:pr-2">
          <TargetProjectField
            projects={aiUtils.targetProjectOptions({
              directory: directory ?? [],
              currentId: projectId,
            })}
            value={projectId}
            disabled={isPlanning || isCreating}
            onChange={(next) => {
              setChosenProjectId(next);
              setPlan(null);
              setAnswerLog([]);
              setExcluded([]);
            }}
          />
          <PlanModelField
            projectId={projectId}
            models={models}
            disabled={isPlanning}
          />
          <Form {...form}>
            <form
              id={PLAN_FORM_ID}
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                submitPlan();
              }}
            >
              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('What should the workflow do?')}</FormLabel>
                    <CharacterCounter
                      multiline
                      length={prompt.length}
                      max={AI_PROMPT_MAX_LENGTH}
                    >
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={5}
                          autoFocus
                          maxLength={AI_PROMPT_MAX_LENGTH}
                          placeholder={t(
                            'For example: when an employee is onboarded in Beisen, create their Feishu account by department and tell the HR group',
                          )}
                          onKeyDown={(event) => {
                            if (
                              event.key === 'Enter' &&
                              (event.metaKey || event.ctrlKey) &&
                              !event.nativeEvent.isComposing
                            ) {
                              event.preventDefault();
                              submitPlan();
                            }
                          }}
                        />
                      </FormControl>
                    </CharacterCounter>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">
                  {t('Try an example')}
                </span>
                <div className="flex flex-wrap gap-2">
                  {examplePrompts().map((example) => (
                    <Button
                      key={example}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto max-w-full justify-start whitespace-normal py-1.5 text-left font-normal"
                      onClick={() =>
                        form.setValue('prompt', example, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                    >
                      {example}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {plan && (
                  <Button
                    type="submit"
                    variant="outline"
                    loading={isPlanning}
                    disabled={
                      models.isLoading ||
                      isPlanning ||
                      isCreating ||
                      prompt.trim().length === 0
                    }
                  >
                    {t('Plan again')}
                  </Button>
                )}
                {isPlanning && !models.usesRules && (
                  <span className="text-xs text-muted-foreground">
                    {t('Planning usually takes 10 to 30 seconds.')}
                  </span>
                )}
                {isStale && !isPlanning && (
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid="plan-stale"
                  >
                    {t(
                      'The description changed. Plan again to update the steps.',
                    )}
                  </span>
                )}
              </div>
            </form>
          </Form>
        </div>
        <section
          aria-live="polite"
          className="flex min-w-0 flex-col gap-4 rounded-md border p-4 lg:overflow-y-auto"
        >
          {hasPlanError && !isPlanning && (
            <PlanFailure
              message={form.formState.errors.root?.serverError?.message ?? ''}
              canUseRules={modelFailed}
              templates={closestTemplates ?? []}
              onUseRules={() =>
                form.handleSubmit((values) =>
                  requestPlan({ values, answers: [], withModel: false }),
                )()
              }
              onPickTemplate={(template) => {
                form.setValue('prompt', template.examplePrompt, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
                void form.handleSubmit((values) =>
                  requestPlan({ values, answers: [], withModel: true }),
                )();
              }}
            />
          )}
          {isPlanning ? (
            <PlanningState usesRules={models.usesRules} />
          ) : plan ? (
            <PlanReview
              key={planCount}
              plan={plan}
              projectId={projectId}
              answered={answerLog}
              isBusy={isPlanning || isCreating}
              onReplan={(answers) =>
                form.handleSubmit((values) =>
                  requestPlan({ values, answers, withModel: plannedWithModel }),
                )()
              }
              onRemoveStep={(key) =>
                requestPlan({
                  values: { prompt: plannedPrompt },
                  answers: [],
                  withModel: plannedWithModel,
                  nextExcluded: [...excluded, key],
                })
              }
              onRestoreStep={(key) =>
                requestPlan({
                  values: { prompt: plannedPrompt },
                  answers: [],
                  withModel: plannedWithModel,
                  nextExcluded: excluded.filter((item) => item !== key),
                })
              }
            />
          ) : hasPlanError ? null : (
            <PlanIntro />
          )}
        </section>
      </div>
      <DialogFooter className="items-center">
        {plan && (
          <span
            className="mr-auto text-xs text-muted-foreground"
            data-testid="plan-footer-info"
          >
            {t(
              '{count, plural, =1 {1 step} other {# steps}} will be created as a draft, all marked "to confirm"',
              { count: plan.steps.length + 1 },
            )}
            {openCount > 0 &&
              ` · ${t('{count} questions unanswered', { count: openCount })}`}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          {t('Cancel')}
        </Button>
        {plan ? (
          <Button
            type="button"
            loading={isCreating}
            disabled={isPlanning || isCreating}
            onClick={() => createDraft(plan)}
          >
            {t('Create draft')}
          </Button>
        ) : (
          <Button
            type="submit"
            form={PLAN_FORM_ID}
            loading={isPlanning}
            disabled={
              models.isLoading ||
              isPlanning ||
              isCreating ||
              prompt.trim().length === 0
            }
          >
            {t('Start planning')}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function PlanFailure({
  message,
  canUseRules,
  templates,
  onUseRules,
  onPickTemplate,
}: {
  message: string;
  canUseRules: boolean;
  templates: PlanTemplate[];
  onUseRules: () => void;
  onPickTemplate: (template: PlanTemplate) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive" data-testid="plan-error">
        <CircleAlert />
        <AlertTitle>{t('Planning failed')}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>{message}</p>
          {canUseRules && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onUseRules}
            >
              {t('Plan with built-in rules instead')}
            </Button>
          )}
        </AlertDescription>
      </Alert>
      {templates.length > 0 && (
        <ClosestTemplates templates={templates} onPick={onPickTemplate} />
      )}
    </div>
  );
}

function ClosestTemplates({
  templates,
  onPick,
}: {
  templates: PlanTemplate[];
  onPick: (template: PlanTemplate) => void;
}) {
  return (
    <section
      className="flex flex-col gap-2"
      data-testid="plan-closest-templates"
    >
      <h4 className="text-sm font-medium">{t('Closest templates')}</h4>
      <span className="text-xs text-muted-foreground">
        {t(
          'These are the scenarios the built-in rules know. Pick one to fill in the description and plan again.',
        )}
      </span>
      <ul className="flex flex-col gap-2">
        {templates.map((template) => (
          <li key={template.id}>
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full flex-col items-start gap-0.5 whitespace-normal py-2 text-left font-normal"
              onClick={() => onPick(template)}
            >
              <span className="text-sm font-medium">{template.name}</span>
              <span className="text-xs text-muted-foreground">
                {template.description}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlanIntro() {
  return (
    <div className="flex flex-col gap-4" data-testid="plan-intro">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">
          {t('What do you want to automate?')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'Write it on the left, or pick an example. Every step in the draft is marked "to confirm"; you check them one by one, then debug and publish.',
          )}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {INTRO_ITEMS.map((item) => (
          <li key={item.title} className="flex items-start gap-3">
            <item.icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{t(item.title)}</span>
              <span className="text-xs text-muted-foreground">
                {t(item.description)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanningState({ usesRules }: { usesRules: boolean }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 text-sm text-muted-foreground"
      data-testid="plan-loading"
    >
      <Sparkles className="size-4 animate-pulse text-primary" />
      {usesRules ? t('Planning with built-in rules...') : t('Planning...')}
    </div>
  );
}

function TargetProjectField({
  projects,
  value,
  disabled,
  onChange,
}: {
  projects: ProjectDirectoryItem[];
  value: string;
  disabled: boolean;
  onChange: (projectId: string) => void;
}) {
  const current = projects.find((project) => project.id === value);
  if (!current) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="ai-target-project">{t('Create in project')}</Label>
      {projects.length > 1 ? (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id="ai-target-project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span id="ai-target-project" className="text-sm font-medium">
          {current.displayName}
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        {t(
          'The draft and the model connection are both taken from this project.',
        )}
      </span>
    </div>
  );
}

function defaultPromptValues(initialPrompt?: string): PromptValues {
  return { prompt: (initialPrompt ?? '').slice(0, AI_PROMPT_MAX_LENGTH) };
}

function examplePrompts(): string[] {
  return [
    t(
      'When an employee is onboarded in Beisen, create their Feishu account by department and post a welcome message to the HR group',
    ),
    t(
      'When an employee leaves in Beisen, suspend their Feishu account and notify IT to collect equipment',
    ),
    t(
      'When an employee transfers in Beisen, update their department and manager in Feishu',
    ),
  ];
}

const PromptSchema = GenerateWorkflowPlanRequestBody.pick({ prompt: true });

const INTRO_ITEMS = [
  {
    icon: ListChecks,
    title: 'Steps',
    description: 'The trigger and each step, in order.',
  },
  {
    icon: Plug,
    title: 'Connections needed',
    description:
      'Which systems the steps talk to, and whether this project already has a connection for each.',
  },
  {
    icon: Sparkles,
    title: 'Questions to confirm',
    description:
      'What cannot be guessed, such as the group to notify. Unanswered ones stay empty in the draft.',
  },
];

type PromptValues = z.infer<typeof PromptSchema>;

const PLAN_FORM_ID = 'generate-workflow-plan-form';
