import {
  AI_PROMPT_MAX_LENGTH,
  GenerateWorkflowPlanRequestBody,
  PlanAnswer,
  WorkflowPlan,
  WorkflowPlanStep,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Info, TriangleAlert, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { authenticationSession } from '@/lib/authentication-session';

import { aiHooks } from '../hooks/ai-hooks';
import { aiUtils } from '../utils/ai-utils';

import { ModelConnectionSelect } from './model-connection-select';

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <GenerateWorkflowForm
          key={open ? 'open' : 'closed'}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function GenerateWorkflowForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const projectId = authenticationSession.getProjectId() ?? '';
  const navigate = useNavigate();
  const models = aiHooks.useModelSelection(projectId);
  const [plan, setPlan] = useState<WorkflowPlan | null>(null);
  const [planCount, setPlanCount] = useState(0);
  const form = useForm<PromptValues>({
    resolver: zodResolver(PromptSchema),
    mode: 'onChange',
    defaultValues: defaultPromptValues(),
  });
  const { mutate: generate, isPending: isPlanning } = aiHooks.useGeneratePlan({
    onError: (message) =>
      form.setError('root.serverError', { type: 'manual', message }),
  });
  const { mutate: apply, isPending: isCreating } = aiHooks.useApplyPlan();
  const prompt = form.watch('prompt');

  const requestPlan = ({
    values,
    answers,
  }: {
    values: PromptValues;
    answers?: PlanAnswer[];
  }) => {
    form.clearErrors('root.serverError');
    if (!models.selectedId) {
      return;
    }
    generate(
      {
        projectId,
        modelConnectionExternalId: models.selectedId,
        prompt: values.prompt,
        answers,
      },
      {
        onSuccess: (next) => {
          setPlan(next);
          setPlanCount((count) => count + 1);
        },
      },
    );
  };

  const createDraft = (current: WorkflowPlan) =>
    apply(
      { projectId, plan: current },
      {
        onSuccess: ({ workflowId }) => {
          onOpenChange(false);
          navigate(
            authenticationSession.appendProjectRoutePrefix(
              `/workflows/${workflowId}`,
            ),
          );
        },
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('Create with AI')}</DialogTitle>
        <DialogDescription>
          {t(
            'Describe what should happen. AI drafts the trigger and steps, and you review them in the editor before publishing.',
          )}
        </DialogDescription>
      </DialogHeader>
      <ModelConnectionSelect
        connections={models.connections}
        isLoading={models.isLoading}
        value={models.selectedId}
        onChange={models.select}
        disabled={isPlanning}
      />
      <Form {...form}>
        <form
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((values) => requestPlan({ values }))}
        >
          <FormField
            control={form.control}
            name="prompt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('What should the workflow do?')}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={4}
                    maxLength={AI_PROMPT_MAX_LENGTH}
                    placeholder={t(
                      'For example: when an approval is approved, create a purchase order and notify the requester.',
                    )}
                  />
                </FormControl>
                <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                  <FormMessage />
                  <span className="ml-auto">
                    {t('{count} / {max}', {
                      count: prompt.length,
                      max: AI_PROMPT_MAX_LENGTH,
                    })}
                  </span>
                </div>
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
                  className="h-auto whitespace-normal text-left font-normal"
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
          {form.formState.errors.root?.serverError && (
            <p className="text-sm text-destructive">
              {form.formState.errors.root.serverError.message}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              loading={isPlanning}
              disabled={!models.selectedId || isPlanning || isCreating}
            >
              {plan ? t('Plan again') : t('Plan')}
            </Button>
            {isPlanning && (
              <span className="text-xs text-muted-foreground">
                {t('Planning usually takes 10 to 30 seconds.')}
              </span>
            )}
          </div>
        </form>
      </Form>
      {plan && (
        <PlanReview
          key={planCount}
          plan={plan}
          isBusy={isPlanning || isCreating}
          onReplan={(answers) =>
            form.handleSubmit((values) => requestPlan({ values, answers }))()
          }
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
        {plan && (
          <Button
            type="button"
            loading={isCreating}
            disabled={isPlanning || isCreating}
            onClick={() => createDraft(plan)}
          >
            {t('Create draft')}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function PlanReview({
  plan,
  isBusy,
  onReplan,
}: {
  plan: WorkflowPlan;
  isBusy: boolean;
  onReplan: (answers: PlanAnswer[]) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const filledAnswers = aiUtils.planAnswers({
    questions: plan.questions,
    answers,
  });
  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{plan.displayName}</h3>
        <p className="text-sm text-muted-foreground">{plan.summary}</p>
      </div>
      <Alert variant="primary">
        <Info className="size-4" />
        <AlertDescription>
          {t(
            'Every generated step needs review before publishing. Check the inputs and connections of each step in the editor.',
          )}
        </AlertDescription>
      </Alert>
      {(plan.omittedSteps > 0 || plan.warnings.length > 0) && (
        <Alert variant="warning">
          <TriangleAlert className="size-4" />
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {plan.omittedSteps > 0 && (
                <li>{t('omittedPlanSteps', { count: plan.omittedSteps })}</li>
              )}
              {plan.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <ol className="flex flex-col gap-2">
        <PlanStepRow step={plan.trigger} label={t('Trigger')} />
        {plan.steps.map((step, index) => (
          <PlanStepRow
            key={`${index}-${step.connectorName}-${step.operationName}`}
            step={step}
            label={t('Step {number}', { number: index + 1 })}
          />
        ))}
      </ol>
      {plan.questions.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              {t('Questions from the AI')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t(
                'Answer what you can, then plan again. Unanswered questions can be settled in the editor.',
              )}
            </span>
          </div>
          {plan.questions.map((question, index) => (
            <div key={index} className="flex flex-col gap-1">
              <Label htmlFor={`plan-question-${index}`}>{question}</Label>
              <Input
                id={`plan-question-${index}`}
                value={answers[question] ?? ''}
                maxLength={MAX_ANSWER_LENGTH}
                disabled={isBusy}
                onChange={(event) =>
                  setAnswers({ ...answers, [question]: event.target.value })
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={isBusy || filledAnswers.length === 0}
            onClick={() => onReplan(filledAnswers)}
          >
            {t('Re-plan with answers')}
          </Button>
        </div>
      )}
    </div>
  );
}

function PlanStepRow({
  step,
  label,
}: {
  step: WorkflowPlanStep;
  label: string;
}) {
  return (
    <li className="flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium">{step.displayName}</span>
        {aiUtils.needsConnection(step) && (
          <Badge variant="outline">
            {t('Needs a {connector} connection', {
              connector: step.connectorDisplayName,
            })}
          </Badge>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {step.connectorDisplayName} · {step.operationDisplayName}
      </span>
    </li>
  );
}

function defaultPromptValues(): PromptValues {
  return { prompt: '' };
}

function examplePrompts(): string[] {
  return [
    t(
      'When a new hire is onboarded in Beisen, create their Feishu account and add them to the right department.',
    ),
    t(
      'Every weekday at 9:00, send the list of orders that failed to sync yesterday to a Feishu group.',
    ),
    t(
      'When a DingTalk approval is approved, create a purchase order in Kingdee and notify the requester.',
    ),
  ];
}

const PromptSchema = GenerateWorkflowPlanRequestBody.pick({ prompt: true });
const MAX_ANSWER_LENGTH = 1000;

type PromptValues = z.infer<typeof PromptSchema>;
