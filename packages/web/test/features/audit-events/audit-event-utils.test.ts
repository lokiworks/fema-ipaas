import { readFileSync } from 'fs';
import path from 'path';

import {
  ApplicationEvent,
  ApplicationEventName,
  WorkflowCreatedEvent,
} from '@fema-ipaas/shared';
import i18n from 'i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditEventUtils } from '@/features/audit-events/utils/audit-event-utils';

function signInFailed(detail: string | undefined): ApplicationEvent {
  return {
    id: 'e1',
    tenantId: 't1',
    created: '2025-06-15T12:00:00Z',
    updated: '2025-06-15T12:00:00Z',
    action: ApplicationEventName.USER_SIGN_IN_FAILED,
    ip: '127.0.0.1',
    data: { target: 'a@corp.test', detail },
  };
}

describe('auditEventUtils.summarize for failed sign-ins', () => {
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

  it('writes password failures in plain Chinese', () => {
    expect(
      auditEventUtils.summarize({
        event: signInFailed('password: INVALID_CREDENTIALS'),
      }),
    ).toBe('邮箱 a@corp.test 使用密码登录失败：邮箱或密码错误');
  });

  it('names the verification code method', () => {
    expect(
      auditEventUtils.summarize({
        event: signInFailed('email code: INVALID_OTP'),
      }),
    ).toBe('邮箱 a@corp.test 使用邮箱验证码登录失败：验证码错误或已过期');
  });

  it('falls back to a generic reason for unknown codes', () => {
    expect(
      auditEventUtils.summarize({
        event: signInFailed('password: SOMETHING_ELSE'),
      }),
    ).toBe('邮箱 a@corp.test 使用密码登录失败：登录被拒绝');
  });

  it('keeps single sign-on details as they were recorded', () => {
    expect(
      auditEventUtils.summarize({
        event: signInFailed('OIDC: STATE_MISMATCH - expired'),
      }),
    ).toBe('a@corp.test · OIDC: STATE_MISMATCH - expired');
  });
});

function baseEvent() {
  return {
    id: 'e1',
    tenantId: 't1',
    created: '2025-06-15T12:00:00Z',
    updated: '2025-06-15T12:00:00Z',
    ip: '127.0.0.1',
  };
}

function finishedRun(status: string): ApplicationEvent {
  return {
    ...baseEvent(),
    action: ApplicationEventName.EXECUTION_FINISHED,
    data: {
      execution: {
        id: 'abcdef123',
        workflowId: 'w1',
        workflowVersionId: 'v1',
        environment: 'PRODUCTION',
        workflowDisplayName: '同步人员',
        status,
      },
    },
  };
}

describe('auditEventUtils.summarize in Chinese', () => {
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

  it('reports the final status of a finished run', () => {
    expect(auditEventUtils.summarize({ event: finishedRun('SUCCEEDED') })).toBe(
      '工作流「同步人员」运行 abcdef 已完成',
    );
    expect(auditEventUtils.summarize({ event: finishedRun('FAILED') })).toBe(
      '工作流「同步人员」运行 abcdef 失败',
    );
    expect(auditEventUtils.summarize({ event: finishedRun('CANCELED') })).toBe(
      '工作流「同步人员」运行 abcdef 已停止',
    );
  });

  it('names how a user signed up', () => {
    const event: ApplicationEvent = {
      ...baseEvent(),
      action: ApplicationEventName.USER_SIGNED_UP,
      userEmail: 'a@corp.test',
      data: { source: 'credentials' },
    };
    expect(auditEventUtils.summarize({ event })).toBe(
      '用户 a@corp.test 通过邮箱和密码注册',
    );
  });

  it('resolves removed members to names, emails or a placeholder', () => {
    const removed = (userId: string, email?: string): ApplicationEvent => ({
      ...baseEvent(),
      action: ApplicationEventName.MEMBER_REMOVED,
      data: { member: { userId, role: 'Operator', email } },
    });
    const userNames = { u1: '张三' };
    expect(auditEventUtils.summarize({ event: removed('u1'), userNames })).toBe(
      '张三 已被移出项目',
    );
    expect(
      auditEventUtils.summarize({
        event: removed('u2', 'b@corp.test'),
        userNames,
      }),
    ).toBe('b@corp.test 已被移出项目');
    expect(auditEventUtils.summarize({ event: removed('u3'), userNames })).toBe(
      '已删除的用户（u3） 已被移出项目',
    );
  });

  it('resolves tenant user removals and keeps the transfer target', () => {
    const event: ApplicationEvent = {
      ...baseEvent(),
      action: ApplicationEventName.TENANT_USER_REMOVED,
      data: { target: 'gone', detail: '3 resources to u1' },
    };
    expect(
      auditEventUtils.summarize({ event, userNames: { u1: '张三' } }),
    ).toBe('已移除用户 已删除的用户（gone），其名下 3 项资源已转交给 张三');
  });

  it('describes sent and revoked project invitations with the invitee and role', () => {
    const invitation = (
      action:
        | ApplicationEventName.INVITATION_SENT
        | ApplicationEventName.INVITATION_REVOKED,
    ): ApplicationEvent => ({
      ...baseEvent(),
      action,
      data: { invitation: { email: 'new@corp.test', role: 'Developer' } },
    });
    expect(
      auditEventUtils.summarize({
        event: invitation(ApplicationEventName.INVITATION_SENT),
        userNames: {},
      }),
    ).toContain('new@corp.test');
    expect(
      auditEventUtils.summarize({
        event: invitation(ApplicationEventName.INVITATION_REVOKED),
        userNames: {},
      }),
    ).toBe('已撤销对 new@corp.test 的邀请');
    expect(
      auditEventUtils.actionLabel(ApplicationEventName.INVITATION_SENT),
    ).toBe('发出邀请');
    expect(
      auditEventUtils.actionLabel(ApplicationEventName.INVITATION_REVOKED),
    ).toBe('撤销邀请');
  });

  it('shows the workflow name carried by the created event', () => {
    const event = WorkflowCreatedEvent.parse({
      ...baseEvent(),
      action: ApplicationEventName.WORKFLOW_CREATED,
      data: {
        workflow: {
          id: 'w1',
          externalId: 'w1',
          created: '2025-06-15T12:00:00Z',
          updated: '2025-06-15T12:00:00Z',
          version: { displayName: '人员同步' },
        },
      },
    });
    expect(auditEventUtils.summarize({ event })).toBe(
      '已创建工作流「人员同步」',
    );
  });

  it('treats sign-in events as platform level', () => {
    expect(
      auditEventUtils.isPlatformLevel(ApplicationEventName.USER_SIGNED_IN),
    ).toBe(true);
    expect(
      auditEventUtils.isPlatformLevel(ApplicationEventName.WORKFLOW_CREATED),
    ).toBe(false);
  });

  it('tells a new connection apart from an updated one and drops the internal id', () => {
    const connection = {
      displayName: '北森生产',
      externalId: 'Mk2VGB5RpRDlw53IlY2eg',
      connectorName: 'beisen',
      status: 'ACTIVE',
      type: 'SECRET_TEXT',
      id: 'c1',
      created: '2026-10-28T08:00:00.000Z',
      updated: '2026-10-28T08:00:00.120Z',
    };
    const created: ApplicationEvent = {
      ...baseEvent(),
      action: ApplicationEventName.CONNECTION_UPSERTED,
      data: { connection },
    };
    const updated: ApplicationEvent = {
      ...baseEvent(),
      action: ApplicationEventName.CONNECTION_UPSERTED,
      data: {
        connection: { ...connection, updated: '2026-10-28T09:00:00.000Z' },
      },
    };
    expect(auditEventUtils.eventActionLabel(created)).toBe('新建连接');
    expect(auditEventUtils.summarize({ event: created })).toBe(
      '已新建连接「北森生产」',
    );
    expect(auditEventUtils.eventActionLabel(updated)).toBe('更新连接');
    expect(auditEventUtils.summarize({ event: updated })).toBe(
      '已更新连接「北森生产」',
    );
  });

  it('tells a new project config apart from an updated one', () => {
    const variable = {
      id: 'v1',
      name: 'FEISHU_GROUP_ID',
      created: '2026-10-28T08:00:00.000Z',
      updated: '2026-10-28T08:00:00.000Z',
    };
    const created: ApplicationEvent = {
      ...baseEvent(),
      action: ApplicationEventName.VARIABLE_UPSERTED,
      data: { variable },
    };
    const updated: ApplicationEvent = {
      ...baseEvent(),
      action: ApplicationEventName.VARIABLE_UPSERTED,
      data: { variable: { ...variable, updated: '2026-10-29T08:00:00.000Z' } },
    };
    expect(auditEventUtils.summarize({ event: created })).toBe(
      '已新建配置项「FEISHU_GROUP_ID」',
    );
    expect(auditEventUtils.summarize({ event: updated })).toBe(
      '已更新配置项「FEISHU_GROUP_ID」',
    );
  });

  it('describes project creation and mapping table changes', () => {
    const projectCreated: ApplicationEvent = {
      ...baseEvent(),
      action: ApplicationEventName.PROJECT_CREATED,
      data: { createdProject: { id: 'p2', displayName: '人事集成' } },
    };
    const rowsAdded: ApplicationEvent = {
      ...baseEvent(),
      action: ApplicationEventName.MAPPING_TABLE_UPDATED,
      data: { mappingTable: { id: 'm1', name: '部门映射' }, addedRows: 2 },
    };
    expect(auditEventUtils.eventActionLabel(projectCreated)).toBe('创建项目');
    expect(auditEventUtils.summarize({ event: projectCreated })).toBe(
      '已创建项目「人事集成」',
    );
    expect(auditEventUtils.summarize({ event: rowsAdded })).toBe(
      '已向映射表「部门映射」添加 2 行',
    );
  });

  it('phrases every action label as a verb phrase without a trailing status', () => {
    Object.values(ApplicationEventName).forEach((name) => {
      expect(auditEventUtils.actionLabel(name)).not.toMatch(/^已/);
    });
  });
});
