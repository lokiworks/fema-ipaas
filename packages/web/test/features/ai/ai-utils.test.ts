import { LlmProvider } from '@fema-ipaas/core-utils';
import {
  AiFeature,
  ColorName,
  DefaultProjectRole,
  ProjectDirectoryItem,
  WorkflowPlan,
  WorkflowPlanStep,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { aiUtils } from '@/features/ai/utils/ai-utils';

describe('aiUtils labels', () => {
  it('labels every feature', () => {
    expect(
      Object.values(AiFeature).map((feature) => aiUtils.featureLabel(feature)),
    ).toEqual([
      'Generate workflow',
      'Editor assistant',
      'Ask model step',
      'AI agent step',
      'AI auto-mapping',
    ]);
  });

  it('labels every provider', () => {
    expect(
      Object.values(LlmProvider).map((provider) =>
        aiUtils.providerLabel(provider),
      ),
    ).toEqual(['Claude', 'OpenAI', 'DeepSeek', 'OpenAI-compatible']);
  });
});

describe('aiUtils usage helpers', () => {
  it('sorts rows by total tokens without mutating the input', () => {
    const rows = [
      { id: 'a', inputTokens: 1, outputTokens: 1 },
      { id: 'b', inputTokens: 10, outputTokens: 5 },
      { id: 'c', inputTokens: 3, outputTokens: 0 },
    ];
    expect(aiUtils.sortByTokens(rows).map((row) => row.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('computes a bounded share', () => {
    expect(aiUtils.share({ value: 50, max: 200 })).toBe(25);
    expect(aiUtils.share({ value: 5, max: 0 })).toBe(0);
    expect(aiUtils.share({ value: 300, max: 200 })).toBe(100);
  });

  it('lists recent months newest first', () => {
    const options = aiUtils.monthOptions({
      now: new Date(2026, 0, 31),
      count: 3,
      locale: 'en',
    });
    expect(options.map((option) => option.value)).toEqual([
      '2026-01',
      '2025-12',
      '2025-11',
    ]);
    expect(options[0].label).toBe('January 2026');
  });

  it('turns a month into a range covering the whole month', () => {
    const range = aiUtils.monthRange('2026-02');
    const after = new Date(range.createdAfter);
    const before = new Date(range.createdBefore);
    expect(after.getMonth()).toBe(1);
    expect(after.getDate()).toBe(1);
    expect(before.getMonth()).toBe(1);
    expect(before.getDate()).toBe(28);
  });
});

describe('aiUtils plan helpers', () => {
  const step = (overrides: Partial<WorkflowPlanStep>): WorkflowPlanStep => ({
    connectorName: '@fema-ipaas/connector-feishu',
    connectorDisplayName: 'Feishu',
    operationName: 'create_user',
    operationDisplayName: 'Create user',
    displayName: 'Create user',
    input: {},
    requiresConnection: true,
    connectionExternalId: null,
    ...overrides,
  });

  it('finds the trigger and steps that still need a connection', () => {
    const plan: WorkflowPlan = {
      displayName: 'Onboarding',
      summary: '',
      trigger: step({ requiresConnection: false }),
      steps: [
        step({ displayName: 'a' }),
        step({ displayName: 'b', connectionExternalId: 'conn1' }),
      ],
      questions: [],
      warnings: [],
      omittedSteps: 0,
    };
    expect(
      aiUtils.stepsNeedingConnection(plan).map((item) => item.displayName),
    ).toEqual(['a']);
  });

  it('keeps only answered questions, in question order', () => {
    expect(
      aiUtils.planAnswers({
        questions: ['Which department?', 'Which group?', 'Notify whom?'],
        answers: {
          'Notify whom?': ' HR ',
          'Which department?': 'R&D',
          'Which group?': '   ',
        },
      }),
    ).toEqual([
      { question: 'Which department?', answer: 'R&D' },
      { question: 'Notify whom?', answer: 'HR' },
    ]);
  });
});

describe('aiUtils.targetProjectOptions', () => {
  const project = ({
    id,
    myRole,
    workflowCount = 0,
    workflowsLimit = null,
  }: {
    id: string;
    myRole: DefaultProjectRole | null;
    workflowCount?: number;
    workflowsLimit?: number | null;
  }): ProjectDirectoryItem => ({
    id,
    displayName: id,
    description: null,
    icon: { color: ColorName.RED },
    ownerId: 'o',
    ownerName: null,
    created: '',
    updated: '',
    myRole,
    workflowCount,
    runningCount: 0,
    memberCount: 1,
    workflowsLimit,
    monthlyRunsLimit: null,
    releasesEnabled: false,
  });

  it('offers projects the user can edit and that still have room', () => {
    const options = aiUtils.targetProjectOptions({
      directory: [
        project({ id: 'a', myRole: DefaultProjectRole.ADMIN }),
        project({ id: 'b', myRole: DefaultProjectRole.DEVELOPER }),
        project({ id: 'viewer', myRole: DefaultProjectRole.VIEWER }),
        project({
          id: 'full',
          myRole: DefaultProjectRole.ADMIN,
          workflowCount: 3,
          workflowsLimit: 3,
        }),
      ],
      currentId: 'a',
    });
    expect(options.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('always keeps the project the dialog was opened for, so its name is shown', () => {
    const options = aiUtils.targetProjectOptions({
      directory: [project({ id: 'viewer', myRole: DefaultProjectRole.VIEWER })],
      currentId: 'viewer',
    });
    expect(options.map((item) => item.id)).toEqual(['viewer']);
  });
});
