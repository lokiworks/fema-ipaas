import {
  AI_PROMPT_MAX_LENGTH,
  CopilotMode,
  CopilotResponse,
  formErrors,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { BotMessageSquare, FileSearch, Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Markdown } from '@/components/custom/markdown';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { formatUtils } from '@/lib/format-utils';

import { aiHooks } from '../hooks/ai-hooks';

import { ModelConnectionSelect } from './model-connection-select';

export function AiAssistantButton({
  projectId,
  workflowId,
}: {
  projectId: string;
  workflowId: string;
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
            <AssistantPanel projectId={projectId} workflowId={workflowId} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function AssistantPanel({
  projectId,
  workflowId,
}: {
  projectId: string;
  workflowId: string;
}) {
  const models = aiHooks.useModelSelection(projectId);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mutate: ask, isPending } = aiHooks.useCopilot({
    onError: setError,
  });

  const run = ({
    mode,
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
        mode,
        question,
      },
      { onSuccess: (response) => setAnswer({ mode, response }) },
    );
  };

  const disabled = !models.selectedId || isPending;

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <ModelConnectionSelect
        connections={models.connections}
        isLoading={models.isLoading}
        value={models.selectedId}
        onChange={models.select}
        disabled={isPending}
      />
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="justify-start"
          disabled={disabled}
          onClick={() => run({ mode: CopilotMode.EXPLAIN })}
        >
          <FileSearch className="size-4 mr-2" />
          {t('Explain this workflow')}
        </Button>
        <Button
          variant="outline"
          className="justify-start"
          disabled={disabled}
          onClick={() => run({ mode: CopilotMode.DIAGNOSE })}
        >
          <Stethoscope className="size-4 mr-2" />
          {t('Diagnose the last failure')}
        </Button>
      </div>
      <QuestionForm
        disabled={disabled}
        isPending={isPending}
        onAsk={(question) => run({ mode: CopilotMode.ASK, question })}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {isPending && (
        <p className="text-sm text-muted-foreground">{t('Thinking...')}</p>
      )}
      {answer && !isPending && <AnswerView answer={answer} />}
    </div>
  );
}

function QuestionForm({
  disabled,
  isPending,
  onAsk,
}: {
  disabled: boolean;
  isPending: boolean;
  onAsk: (question: string) => void;
}) {
  const form = useForm<QuestionValues>({
    resolver: zodResolver(QuestionSchema),
    mode: 'onChange',
    defaultValues: defaultQuestionValues(),
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
              <FormLabel>{t('Ask a question')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  maxLength={AI_PROMPT_MAX_LENGTH}
                  placeholder={t(
                    'For example: why does the second step sometimes run twice?',
                  )}
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
          {t('Ask')}
        </Button>
      </form>
    </Form>
  );
}

function AnswerView({ answer }: { answer: AssistantAnswer }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <span className="text-xs font-medium text-muted-foreground">
        {modeLabel(answer.mode)}
      </span>
      <Markdown markdown={answer.response.answer} className="text-sm" />
      <span className="text-xs text-muted-foreground">
        {t('{input} input tokens · {output} output tokens', {
          input: formatUtils.formatNumber(answer.response.inputTokens),
          output: formatUtils.formatNumber(answer.response.outputTokens),
        })}
      </span>
    </div>
  );
}

function modeLabel(mode: CopilotMode): string {
  switch (mode) {
    case CopilotMode.EXPLAIN:
      return t('Explain this workflow');
    case CopilotMode.DIAGNOSE:
      return t('Diagnose the last failure');
    case CopilotMode.ASK:
      return t('Your question');
  }
}

function defaultQuestionValues(): QuestionValues {
  return { question: '' };
}

const QuestionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, formErrors.required)
    .max(AI_PROMPT_MAX_LENGTH, 'aiPromptTooLong'),
});

type QuestionValues = z.infer<typeof QuestionSchema>;

type AssistantAnswer = { mode: CopilotMode; response: CopilotResponse };
