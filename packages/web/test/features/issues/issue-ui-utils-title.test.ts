import { readFileSync } from 'fs';
import path from 'path';

import { IssueKind } from '@fema-ipaas/shared';
import i18n from 'i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issueUiUtils } from '@/features/issues/utils/issue-ui-utils';

const zh = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../public/locales/zh/translation.json'),
    'utf-8',
  ),
);

const TRIGGER_ISSUE = {
  kind: IssueKind.TRIGGER,
  title: 'Rate limited: 北森主连接',
  connectionExternalId: 'beisen-main',
  workflowDisplayName: null,
  stepDisplayName: null,
  occurrences: 1,
  affectedWorkflows: 3,
};

describe('issueUiUtils issue titles', () => {
  beforeAll(async () => {
    i18n.addResourceBundle('zh', 'translation', zh);
    await i18n.changeLanguage('zh');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('translates the cause category and keeps the object as stored', () => {
    expect(issueUiUtils.issueTitle(TRIGGER_ISSUE)).toBe(
      '对方系统限流：北森主连接',
    );
  });

  it('keeps old raw-error titles readable through the failure text table', () => {
    expect(
      issueUiUtils.issueTitle({
        kind: IssueKind.STEP,
        title: 'Sync · Call API: Route not found',
        connectionExternalId: null,
      }),
    ).toBe('Sync · Call API: 对方系统没有这个接口地址（Route not found）');
  });

  it('summarises a merged trigger issue by how many workflows it affects', () => {
    expect(issueUiUtils.scopeText(TRIGGER_ISSUE)).toBe('3 个工作流的触发器');
    expect(issueUiUtils.impactText(TRIGGER_ISSUE)).toBe('影响 3 个工作流');
  });

  it('keeps the workflow and step for an issue that belongs to one workflow', () => {
    expect(
      issueUiUtils.scopeText({
        ...TRIGGER_ISSUE,
        workflowDisplayName: '员工入职',
        stepDisplayName: '员工变动',
        affectedWorkflows: 1,
      }),
    ).toBe('员工入职 · 员工变动');
  });
});
