import { Permission } from '@fema-ipaas/core-utils';
import {
  PlanAnswer,
  WorkflowPlan,
  WorkflowPlanSource,
  WorkflowPlanStep,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  CircleCheck,
  CircleX,
  ExternalLink,
  Info,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { useNewWindow } from '@/lib/navigation-utils';
import { NEW_CONNECTION_QUERY_PARAM } from '@/lib/route-utils';

import { aiUtils, ConnectionRow } from '../utils/ai-utils';

export function PlanReview({
  plan,
  projectId,
  answered,
  isBusy,
  onReplan,
}: {
  plan: WorkflowPlan;
  projectId: string;
  answered: PlanAnswer[];
  isBusy: boolean;
  onReplan: (answers: PlanAnswer[]) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const open = aiUtils.openQuestions({ plan, answered });
  const filledAnswers = aiUtils.planAnswers({ questions: open, answers });
  const notes = [
    ...(plan.omittedSteps > 0
      ? [t('omittedPlanSteps', { count: plan.omittedSteps })]
      : []),
    ...(plan.unavailableSystems.length > 0
      ? [
          t(
            'No connector for {systems} in this instance, so no step was generated for it. You can call its API with the HTTP request step in the editor.',
            { systems: plan.unavailableSystems.join(' / ') },
          ),
        ]
      : []),
    ...plan.warnings,
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="plan-review">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{plan.displayName}</h3>
          <Badge variant="outline" data-testid="plan-source">
            {plan.source === WorkflowPlanSource.MODEL
              ? t('Planned by the model')
              : t('Planned by built-in rules')}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{plan.summary}</p>
      </div>
      <Alert variant="primary">
        <Info className="size-4" />
        <AlertDescription>
          {t(
            'Every generated step is marked "to confirm". Open each step in the editor, check it and confirm it. The workflow cannot be published until all of them are confirmed.',
          )}
        </AlertDescription>
      </Alert>
      {notes.length > 0 && (
        <Alert variant="warning" data-testid="plan-notes">
          <TriangleAlert className="size-4" />
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <PlanQuestions
        key={open.join('|')}
        questions={open}
        answered={answered}
        answers={answers}
        isBusy={isBusy}
        filledAnswers={filledAnswers}
        onChange={setAnswers}
        onReplan={onReplan}
      />
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t('Steps')}</h4>
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
      </section>
      <PlanConnections
        rows={aiUtils.connectionRows(plan)}
        projectId={projectId}
        isBusy={isBusy}
        onRefresh={() => onReplan([])}
      />
    </div>
  );
}

function PlanQuestions({
  questions,
  answered,
  answers,
  isBusy,
  filledAnswers,
  onChange,
  onReplan,
}: {
  questions: string[];
  answered: PlanAnswer[];
  answers: Record<string, string>;
  isBusy: boolean;
  filledAnswers: PlanAnswer[];
  onChange: (answers: Record<string, string>) => void;
  onReplan: (answers: PlanAnswer[]) => void;
}) {
  if (questions.length === 0 && answered.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3" data-testid="plan-questions">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium">{t('Questions to confirm')}</h4>
          <Badge variant={questions.length > 0 ? 'info' : 'success'}>
            {questions.length > 0
              ? t('{count} to confirm', { count: questions.length })
              : t('All confirmed')}
          </Badge>
        </div>
        {questions.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t(
              'Answer what you can, then plan again. What stays unanswered is left empty in the draft, and the workflow cannot be published until you fill it in the editor.',
            )}
          </span>
        )}
      </div>
      {answered.map((answer) => (
        <div
          key={answer.question}
          className="flex items-start gap-2 text-sm text-muted-foreground"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <span>
            {answer.question}
            <span className="ml-2 font-medium text-foreground">
              {answer.answer}
            </span>
          </span>
        </div>
      ))}
      {questions.map((question, index) => (
        <div key={question} className="flex flex-col gap-1">
          <Label htmlFor={`plan-question-${index}`}>{question}</Label>
          <Input
            id={`plan-question-${index}`}
            value={answers[question] ?? ''}
            maxLength={MAX_ANSWER_LENGTH}
            disabled={isBusy}
            onChange={(event) =>
              onChange({ ...answers, [question]: event.target.value })
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                filledAnswers.length > 0 &&
                !isBusy
              ) {
                event.preventDefault();
                onReplan(filledAnswers);
              }
            }}
          />
        </div>
      ))}
      {questions.length > 0 && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={isBusy || filledAnswers.length === 0}
          onClick={() => onReplan(filledAnswers)}
        >
          {t('Re-plan with answers')}
        </Button>
      )}
    </section>
  );
}

function PlanConnections({
  rows,
  projectId,
  isBusy,
  onRefresh,
}: {
  rows: ConnectionRow[];
  projectId: string;
  isBusy: boolean;
  onRefresh: () => void;
}) {
  const { checkAccess } = useAuthorization();
  const openNewWindow = useNewWindow();
  const canCreate = checkAccess(Permission.WRITE_CONNECTION);
  if (rows.length === 0) {
    return null;
  }
  const missing = rows.filter((row) => row.connectionDisplayName === null);
  return (
    <section className="flex flex-col gap-2" data-testid="plan-connections">
      <h4 className="text-sm font-medium">{t('Connections needed')}</h4>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.connectorName}
            className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
          >
            {row.connectionDisplayName === null ? (
              <CircleX className="size-4 shrink-0 text-destructive" />
            ) : (
              <CircleCheck className="size-4 shrink-0 text-success" />
            )}
            <span className="font-medium">{row.connectorDisplayName}</span>
            <span className="text-muted-foreground">
              {row.connectionDisplayName === null
                ? t('No usable connection in this project')
                : t('Uses connection {name}', {
                    name: row.connectionDisplayName,
                  })}
            </span>
            {row.connectionDisplayName === null && canCreate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() =>
                  openNewWindow(
                    `/projects/${projectId}/connections`,
                    new URLSearchParams({
                      [NEW_CONNECTION_QUERY_PARAM]: row.connectorName,
                    }).toString(),
                  )
                }
              >
                <ExternalLink className="size-4 mr-1" />
                {t('New connection')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t(
              'You can create the draft without them, but the workflow cannot be published until each step has a connection.',
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isBusy}
            onClick={onRefresh}
          >
            {t('I created it, plan again')}
          </Button>
        </div>
      )}
    </section>
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
        <Badge variant="outline" className="gap-1">
          <Sparkles className="size-3 text-primary" />
          {t('To confirm')}
        </Badge>
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
      <span className="text-xs text-muted-foreground">
        {t(
          '{count, plural, =1 {1 field prefilled} other {# fields prefilled}}',
          {
            count: prefilledCount(step),
          },
        )}
      </span>
    </li>
  );
}

function prefilledCount(step: WorkflowPlanStep): number {
  return Object.values(step.input).filter(
    (value) => value !== '' && value !== null && value !== undefined,
  ).length;
}

const MAX_ANSWER_LENGTH = 1000;
