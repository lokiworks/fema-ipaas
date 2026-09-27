import {
  AI_PROMPT_MAX_LENGTH,
  CopilotChange,
  CopilotChangeKind,
  CopilotDiagnosis,
  CopilotMode,
  CopilotProposal,
  CopilotResponse,
  CopilotStepRef,
  formErrors,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import {
  BotMessageSquare,
  CircleMinus,
  CirclePlus,
  Crosshair,
  PencilLine,
  TextCursorInput,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormattedDate } from '@/components/custom/formatted-date';
import { Markdown } from '@/components/custom/markdown';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { aiHooks } from '../hooks/ai-hooks';

import { ModelConnectionSelect } from './model-connection-select';

export function AiAssistantButton({
  projectId,
  workflowId,
  bridge,
}: {
  projectId: string;
  workflowId: string;
  bridge?: AssistantBuilderBridge;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <BotMessageSquare className="size-3.5" />
        {t('AI assistant')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md flex flex-col gap-4 overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{t('AI assistant')}</SheetTitle>
            <SheetDescription>
              {t(
                'Ask about this workflow. Answers are based on the current draft and recent runs, and may be wrong.',
              )}
            </SheetDescription>
          </SheetHeader>
          {open && (
            <AssistantPanel
              projectId={projectId}
              workflowId={workflowId}
              bridge={bridge}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function AssistantPanel({
  projectId,
  workflowId,
  bridge,
}: {
  projectId: string;
  workflowId: string;
  bridge: AssistantBuilderBridge | undefined;
}) {
  const models = aiHooks.useModelSelection(projectId);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<QuestionMode>(CopilotMode.ASK);
  const [formKey, setFormKey] = useState(0);
  const [draftQuestion, setDraftQuestion] = useState('');
  const { mutate: ask, isPending } = aiHooks.useCopilot({
    onError: setError,
  });
  const canModify = bridge?.canModify === true;

  const run = ({
    mode: requestMode,
    question,
  }: {
    mode: CopilotMode;
    question?: string;
  }) => {
    if (!models.selectedId) {
      return;
    }
    setError(null);
    ask(
      {
        projectId,
        workflowId,
        modelConnectionExternalId: models.selectedId,
        mode: requestMode,
        question,
      },
      {
        onSuccess: (response) =>
          setAnswer({ mode: requestMode, response, applied: false }),
      },
    );
  };

  const prefill = ({
    question,
    questionMode,
  }: {
    question: string;
    questionMode: QuestionMode;
  }) => {
    setMode(questionMode);
    setDraftQuestion(question);
    setFormKey((key) => key + 1);
  };

  const disabled = !models.selectedId || isPending;
  const suggestions = SUGGESTIONS.filter(
    (suggestion) => canModify || suggestion.mode !== CopilotMode.MODIFY,
  ).slice(0, MAX_SUGGESTIONS);

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <ModelConnectionSelect
        connections={models.connections}
        isLoading={models.isLoading}
        value={models.selectedId}
        onChange={models.select}
        disabled={isPending}
      />
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.label()}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto whitespace-normal py-1 text-left text-xs"
            disabled={disabled}
            onClick={() => {
              if (
                suggestion.mode === CopilotMode.EXPLAIN ||
                suggestion.mode === CopilotMode.DIAGNOSE
              ) {
                run({ mode: suggestion.mode });
                return;
              }
              prefill({
                question: suggestion.label(),
                questionMode: suggestion.mode,
              });
            }}
          >
            {suggestion.label()}
          </Button>
        ))}
      </div>
      {canModify && (
        <Tabs
          value={mode}
          onValueChange={(value) =>
            setMode(
              value === CopilotMode.MODIFY
                ? CopilotMode.MODIFY
                : CopilotMode.ASK,
            )
          }
        >
          <TabsList>
            <TabsTrigger value={CopilotMode.ASK}>{t('Ask')}</TabsTrigger>
            <TabsTrigger value={CopilotMode.MODIFY}>{t('Modify')}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <QuestionForm
        key={formKey}
        defaultQuestion={draftQuestion}
        disabled={disabled}
        isPending={isPending}
        mode={mode}
        onAsk={(question) => run({ mode, question })}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {isPending && (
        <p className="text-sm text-muted-foreground">{t('Thinking...')}</p>
      )}
      {answer && !isPending && (
        <AnswerView
          answer={answer}
          bridge={bridge}
          onApplied={() => setAnswer({ ...answer, applied: true })}
          onDismiss={() => {
            bridge?.highlightSteps([]);
            setAnswer(null);
          }}
        />
      )}
    </div>
  );
}

function QuestionForm({
  defaultQuestion,
  disabled,
  isPending,
  mode,
  onAsk,
}: {
  defaultQuestion: string;
  disabled: boolean;
  isPending: boolean;
  mode: QuestionMode;
  onAsk: (question: string) => void;
}) {
  const form = useForm<QuestionValues>({
    resolver: zodResolver(QuestionSchema),
    mode: 'onChange',
    defaultValues: defaultQuestionValues(defaultQuestion),
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-2"
        onSubmit={form.handleSubmit((values) => onAsk(values.question))}
      >
        <FormField
          control={form.control}
          name="question"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  maxLength={AI_PROMPT_MAX_LENGTH}
                  placeholder={
                    mode === CopilotMode.MODIFY
                      ? t(
                          'Describe the change, e.g. add a step that notifies the on-call group after the last step',
                        )
                      : t(
                          'For example: why does the second step sometimes run twice?',
                        )
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          size="sm"
          className="self-start"
          loading={isPending}
          disabled={disabled}
        >
          {mode === CopilotMode.MODIFY ? t('Suggest changes') : t('Ask')}
        </Button>
      </form>
    </Form>
  );
}

function AnswerView({
  answer,
  bridge,
  onApplied,
  onDismiss,
}: {
  answer: AssistantAnswer;
  bridge: AssistantBuilderBridge | undefined;
  onApplied: () => void;
  onDismiss: () => void;
}) {
  const { response } = answer;
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <span className="text-xs font-medium text-muted-foreground">
        {modeLabel(answer.mode)}
      </span>
      {response.diagnosis && (
        <DiagnosisCard diagnosis={response.diagnosis} bridge={bridge} />
      )}
      {response.proposal ? (
        <ProposalView
          proposal={response.proposal}
          applied={answer.applied}
          bridge={bridge}
          onApplied={onApplied}
          onDismiss={onDismiss}
        />
      ) : (
        <Markdown markdown={response.answer} className="text-sm" />
      )}
      {(response.referencedSteps ?? []).length > 0 && bridge && (
        <StepChips steps={response.referencedSteps ?? []} bridge={bridge} />
      )}
      <span className="text-xs text-muted-foreground">
        {t('{input} input tokens · {output} output tokens', {
          input: formatUtils.formatNumber(response.inputTokens),
          output: formatUtils.formatNumber(response.outputTokens),
        })}
      </span>
    </div>
  );
}

function DiagnosisCard({
  diagnosis,
  bridge,
}: {
  diagnosis: CopilotDiagnosis;
  bridge: AssistantBuilderBridge | undefined;
}) {
  const failedStep = diagnosis.failedStep;
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-2 text-sm">
      <span>
        {t(
          '{count, plural, =0 {No failures in the last 7 days} =1 {1 failure in the last 7 days} other {# failures in the last 7 days}}',
          { count: diagnosis.failuresLast7Days },
        )}
      </span>
      {diagnosis.lastFailureAt && (
        <span className="text-xs text-muted-foreground">
          {t('Last failure')}:{' '}
          <FormattedDate date={new Date(diagnosis.lastFailureAt)} />
        </span>
      )}
      {failedStep && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t('Failing step')}:</span>
          {bridge ? (
            <StepChip step={failedStep} bridge={bridge} />
          ) : (
            <span>{failedStep.displayName}</span>
          )}
        </div>
      )}
    </div>
  );
}

function ProposalView({
  proposal,
  applied,
  bridge,
  onApplied,
  onDismiss,
}: {
  proposal: CopilotProposal;
  applied: boolean;
  bridge: AssistantBuilderBridge | undefined;
  onApplied: () => void;
  onDismiss: () => void;
}) {
  const [applyError, setApplyError] = useState<string | null>(null);
  const hasChanges = proposal.changes.length > 0;
  return (
    <div className="flex flex-col gap-2">
      {proposal.summary && (
        <Markdown markdown={proposal.summary} className="text-sm" />
      )}
      {hasChanges && (
        <>
          <span className="text-sm font-medium">
            {t('Suggested changes · {count}', {
              count: proposal.changes.length,
            })}
          </span>
          <div className="flex flex-col gap-1">
            {proposal.changes.map((change) => (
              <ChangeRow
                key={`${change.kind}-${change.stepName}-${change.displayName}`}
                change={change}
              />
            ))}
          </div>
        </>
      )}
      {proposal.unsupported && (
        <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-sm">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <Markdown markdown={proposal.unsupported} className="text-sm" />
        </div>
      )}
      {proposal.rejected.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            {t(
              '{count, plural, =1 {1 suggestion was skipped} other {# suggestions were skipped}}',
              {
                count: proposal.rejected.length,
              },
            )}
          </summary>
          <ul className="mt-1 list-disc pl-4">
            {proposal.rejected.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
      {applyError && <p className="text-sm text-destructive">{applyError}</p>}
      {applied ? (
        <span className="text-sm text-success-700">
          {t('Changes applied. Press ⌘Z / Ctrl+Z to undo.')}
        </span>
      ) : (
        hasChanges &&
        bridge && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => bridge.highlightSteps(proposal.affectedStepNames)}
            >
              <Crosshair className="size-3.5" />
              {t('Show on canvas')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const failure = bridge.applyProposal(proposal);
                setApplyError(failure);
                if (!failure) {
                  onApplied();
                }
              }}
            >
              {t('Apply changes')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
              {t('Not now')}
            </Button>
          </div>
        )
      )}
    </div>
  );
}

function ChangeRow({ change }: { change: CopilotChange }) {
  const Icon = CHANGE_ICONS[change.kind];
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon
        className={cn(
          'mt-0.5 size-3.5 shrink-0',
          change.kind === CopilotChangeKind.DELETE_STEP
            ? 'text-destructive'
            : 'text-primary',
        )}
      />
      <span className="min-w-0">{changeText(change)}</span>
    </div>
  );
}

function StepChips({
  steps,
  bridge,
}: {
  steps: CopilotStepRef[];
  bridge: AssistantBuilderBridge;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{t('Locate')}:</span>
      {steps.map((step) => (
        <StepChip key={step.name} step={step} bridge={bridge} />
      ))}
    </div>
  );
}

function StepChip({
  step,
  bridge,
}: {
  step: CopilotStepRef;
  bridge: AssistantBuilderBridge;
}) {
  return (
    <button
      type="button"
      onClick={() => bridge.locateStep(step.name)}
      className="rounded-sm border px-1.5 py-0.5 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {step.displayName}
    </button>
  );
}

function changeText(change: CopilotChange): string {
  switch (change.kind) {
    case CopilotChangeKind.ADD_STEP:
      return t('Add step {name} ({detail})', {
        name: change.displayName,
        detail: change.detail,
      });
    case CopilotChangeKind.UPDATE_INPUT:
      return t('Change inputs of {name}: {fields}', {
        name: change.displayName,
        fields: change.detail,
      });
    case CopilotChangeKind.DELETE_STEP:
      return t('Delete step {name}', { name: change.displayName });
    case CopilotChangeKind.RENAME_STEP:
      return t('Rename {from} to {to}', {
        from: change.detail,
        to: change.displayName,
      });
  }
}

function modeLabel(mode: CopilotMode): string {
  switch (mode) {
    case CopilotMode.EXPLAIN:
      return t('Explain this workflow');
    case CopilotMode.DIAGNOSE:
      return t('Diagnose the last failure');
    case CopilotMode.ASK:
      return t('Your question');
    case CopilotMode.MODIFY:
      return t('Suggested changes');
  }
}

function defaultQuestionValues(question: string): QuestionValues {
  return { question };
}

const MAX_SUGGESTIONS = 4;

const SUGGESTIONS: { mode: CopilotMode; label: () => string }[] = [
  { mode: CopilotMode.EXPLAIN, label: () => t('What does this workflow do?') },
  { mode: CopilotMode.DIAGNOSE, label: () => t('Why did it fail recently?') },
  {
    mode: CopilotMode.MODIFY,
    label: () => t('Add a step at the end that sends a notification'),
  },
  {
    mode: CopilotMode.ASK,
    label: () => t('Which steps are most likely to fail?'),
  },
];

const CHANGE_ICONS = {
  [CopilotChangeKind.ADD_STEP]: CirclePlus,
  [CopilotChangeKind.UPDATE_INPUT]: TextCursorInput,
  [CopilotChangeKind.DELETE_STEP]: CircleMinus,
  [CopilotChangeKind.RENAME_STEP]: PencilLine,
};

const QuestionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, formErrors.required)
    .max(AI_PROMPT_MAX_LENGTH, 'aiPromptTooLong'),
});

type QuestionValues = z.infer<typeof QuestionSchema>;

type QuestionMode = CopilotMode.ASK | CopilotMode.MODIFY;

type AssistantAnswer = {
  mode: CopilotMode;
  response: CopilotResponse;
  applied: boolean;
};

export type AssistantBuilderBridge = {
  canModify: boolean;
  locateStep: (stepName: string) => void;
  highlightSteps: (stepNames: string[]) => void;
  applyProposal: (proposal: CopilotProposal) => string | null;
};
