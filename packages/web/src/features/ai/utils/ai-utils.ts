import { isNil, LlmProvider } from '@fema-ipaas/core-utils';
import {
  AiFeature,
  PlanAnswer,
  PlanRecommendation,
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

function connectionRows(plan: WorkflowPlan): ConnectionRow[] {
  const rows = [plan.trigger, ...plan.steps]
    .filter((step) => step.requiresConnection)
    .map((step) => ({
      connectorName: step.connectorName,
      connectorDisplayName: step.connectorDisplayName,
      connectionDisplayName: step.connectionDisplayName ?? null,
    }));
  return rows.filter(
    (row, index) =>
      rows.findIndex((other) => other.connectorName === row.connectorName) ===
      index,
  );
}

function mergeAnswers({
  previous,
  next,
}: {
  previous: PlanAnswer[];
  next: PlanAnswer[];
}): PlanAnswer[] {
  const merged = new Map(
    [...previous, ...next].map((answer) => [answer.question, answer]),
  );
  return [...merged.values()];
}

function openQuestions({
  plan,
  answered,
}: {
  plan: WorkflowPlan;
  answered: PlanAnswer[];
}): string[] {
  return plan.questions.filter(
    (question) => !answered.some((answer) => answer.question === question),
  );
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

function recommendationFor({
  plan,
  question,
}: {
  plan: WorkflowPlan;
  question: string;
}): PlanRecommendation | null {
  return (
    plan.recommendations.find(
      (recommendation) => recommendation.question === question,
    ) ?? null
  );
}

function recommendedAnswers({
  plan,
  questions,
}: {
  plan: WorkflowPlan;
  questions: string[];
}): Record<string, string> {
  return Object.fromEntries(
    questions.flatMap((question) => {
      const value = recommendationFor({ plan, question })?.value;
      return isNil(value) ? [] : [[question, value]];
    }),
  );
}

function windowLabel(seconds: number): string {
  return seconds % SECONDS_PER_DAY === 0
    ? t('{count, plural, =1 {1 day} other {# days}}', {
        count: seconds / SECONDS_PER_DAY,
      })
    : t('{count, plural, =1 {1 hour} other {# hours}}', {
        count: Math.max(1, Math.round(seconds / SECONDS_PER_HOUR)),
      });
}

function parseMappingRows(text: string): MappingRowsParse {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const parsed = lines.map((line, index) => {
    const [key, ...rest] = line.split(/[,，\t]/);
    const value = rest.join(',').trim();
    return { line: index + 1, k: (key ?? '').trim(), v: value };
  });
  const broken = parsed.find((row) => row.k.length === 0 || row.v.length === 0);
  return {
    rows: parsed.map(({ k, v }) => ({ k, v })),
    brokenLine: broken?.line ?? null,
  };
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
  connectionRows,
  mergeAnswers,
  openQuestions,
  planAnswers,
  targetProjectOptions,
  recommendationFor,
  recommendedAnswers,
  windowLabel,
  parseMappingRows,
};

const SECONDS_PER_DAY = 24 * 60 * 60;
const SECONDS_PER_HOUR = 60 * 60;

export type MonthOption = { value: string; label: string };

export type ConnectionRow = {
  connectorName: string;
  connectorDisplayName: string;
  connectionDisplayName: string | null;
};

export type MappingRowsParse = {
  rows: { k: string; v: string }[];
  brokenLine: number | null;
};

type TokenCounts = { inputTokens: number; outputTokens: number };
