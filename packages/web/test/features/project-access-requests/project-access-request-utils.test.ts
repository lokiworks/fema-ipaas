import { readFileSync } from 'fs';
import path from 'path';

import i18n from 'i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { projectAccessRequestUtils } from '@/features/project-access-requests/utils/project-access-request-utils';

describe('projectAccessRequestUtils', () => {
  it('collects the projects with a pending request', () => {
    const ids = projectAccessRequestUtils.pendingProjectIds([
      { projectId: 'p1' },
      { projectId: 'p2' },
      { projectId: 'p1' },
    ]);
    expect([...ids].sort()).toEqual(['p1', 'p2']);
    expect(projectAccessRequestUtils.pendingProjectIds(undefined).size).toBe(0);
  });

  it('links to the members tab of the project', () => {
    expect(projectAccessRequestUtils.membersLink('p1')).toBe(
      '/projects/p1/home?share=1',
    );
  });

  it('falls back to the email when the requester has no name', () => {
    expect(
      projectAccessRequestUtils.requesterName({
        userId: 'u1',
        userEmail: 'zhang@corp.test',
        userFirstName: '',
        userLastName: null,
      }),
    ).toBe('zhang@corp.test');
    expect(
      projectAccessRequestUtils.requesterName({
        userId: 'u1',
        userEmail: null,
        userFirstName: null,
        userLastName: null,
      }),
    ).toBe('u1');
  });
});

describe('projectAccessRequestUtils in Chinese', () => {
  beforeAll(async () => {
    const zh = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../../public/locales/zh/translation.json'),
        'utf-8',
      ),
    );
    i18n.addResourceBundle('zh', 'translation', zh, true, true);
    await i18n.changeLanguage('zh');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('puts the family name first for Chinese names', () => {
    expect(
      projectAccessRequestUtils.requesterName({
        userId: 'u1',
        userEmail: 'zhang@corp.test',
        userFirstName: '三',
        userLastName: '张',
      }),
    ).toBe('张三');
  });

  it('uses the shared wording for decisions', () => {
    expect(
      projectAccessRequestUtils.decidedMessage({ name: '张三', approve: true }),
    ).toBe('已通过「张三」的申请');
    expect(
      projectAccessRequestUtils.decidedMessage({ name: '张三', approve: false }),
    ).toBe('已拒绝「张三」的申请');
  });

  it('shows a placeholder for an empty reason', () => {
    expect(projectAccessRequestUtils.reasonText('  ')).toBe('未填写');
    expect(projectAccessRequestUtils.reasonText(' 看日志 ')).toBe('看日志');
  });

  it('has the request wording in Chinese', () => {
    expect(i18n.t('projectAccessSubmitted')).toBe('已申请，等待项目所有者审核');
    expect(i18n.t('projectAccessPendingTitle', { count: 2 })).toBe(
      '待审批的申请（2）',
    );
    expect(i18n.t('projectAccessRequestedBadge')).toBe('已申请');
  });
});
