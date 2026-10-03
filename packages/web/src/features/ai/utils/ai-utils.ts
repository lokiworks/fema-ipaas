import { LlmProvider } from '@fema-ipaas/core-utils';
import {
  AiFeature,
  PlanAnswer,
  ProjectDirectoryItem,
  WorkflowPlan,
  WorkflowPlanStep,
} from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { t } from 'i18next';

import { projectDirectoryUtils } from '@/features/projects/api/project-directory-api';

function featureLabel(feature: AiFeature): string {
  switch (feature) {
    case AiFeature.GENERATE_WORKFLOW:
      return t('Generate workflow');
    case AiFeature.COPILOT:
      return t('Editor assistant');
    case AiFeature.ASK_MODEL:
      return t('Ask model step');
    case AiFeature.AGENT:
      return t('AI agent step');
    case AiFeature.AUTO_MAPPING:
      return t('AI auto-mapping');
  }
}

function providerLabel(provider: LlmProvider): string {
  switch (provider) {
    case LlmProvider.ANTHROPIC:
      return 'Claude';
    case LlmProvider.OPENAI:
      return 'OpenAI';
    case LlmProvider.DEEPSEEK:
      return 'DeepSeek';
    case LlmProvider.OPENAI_COMPATIBLE:
      return t('OpenAI-compatible');
  }
}

function totalTokens(usage: TokenCounts): number {
  return usage.inputTokens + usage.outputTokens;
}

function sortByTokens<T extends TokenCounts>(rows: T[]): T[] {
  return [...rows].sort((a, b) => totalTokens(b) - totalTokens(a));
}

function share({ value, max }: { value: number; max: number }): number {
  if (max <= 0 || value <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((value / max) * 100));
}

function monthOptions({
  now,
  count,
  locale,
}: {
  now: Date;
  count: number;
  locale: string;
}): MonthOption[] {
  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
  });
  return Array.from({ length: count }, (_unused, index) => {
    const month = dayjs(now).startOf('month').subtract(index, 'month');
    return {
      value: month.format('YYYY-MM'),
      label: formatter.format(month.toDate()),
    };
  });
}

function monthRange(month: string): {
  createdAfter: string;
  createdBefore: string;
} {
  const start = dayjs(`${month}-01`);
  const base = start.isValid() ? start : dayjs().startOf('month');
  return {
    createdAfter: base.startOf('month').toISOString(),
    createdBefore: base.endOf('month').toISOString(),
  };
}

function stepsNeedingConnection(plan: WorkflowPlan): WorkflowPlanStep[] {
  return [plan.trigger, ...plan.steps].filter(needsConnection);
}

function needsConnection(step: WorkflowPlanStep): boolean {
  return step.requiresConnection && step.connectionExternalId === null;
}

function targetProjectOptions({
  directory,
  currentId,
}: {
  directory: ProjectDirectoryItem[];
  currentId: string;
}): ProjectDirectoryItem[] {
  return directory.filter(
    (project) =>
      project.id === currentId ||
      projectDirectoryUtils.canCreateWorkflow(project),
  );
}

function planAnswers({
  questions,
  answers,
}: {
  questions: string[];
  answers: Record<string, string>;
}): PlanAnswer[] {
  return questions
    .map((question) => ({
      question,
      answer: (answers[question] ?? '').trim(),
    }))
    .filter((pair) => pair.answer.length > 0);
}

export const aiUtils = {
  featureLabel,
  providerLabel,
  totalTokens,
  sortByTokens,
  share,
  monthOptions,
  monthRange,
  needsConnection,
  stepsNeedingConnection,
  planAnswers,
  targetProjectOptions,
};

export type MonthOption = { value: string; label: string };

type TokenCounts = { inputTokens: number; outputTokens: number };
