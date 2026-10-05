import { readFileSync } from 'fs';
import path from 'path';

import i18n from 'i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectionUtils } from '@/features/connections/utils/utils';
import { connectorErrorGuideUtils } from '@/features/connectors/utils/connector-error-guides';

const zh = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../public/locales/zh/translation.json'),
    'utf-8',
  ),
);

describe('connectorErrorGuideUtils.guideFor', () => {
  beforeAll(async () => {
    i18n.addResourceBundle('zh', 'translation', zh);
    await i18n.changeLanguage('zh');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('tells a Beisen credential failure to check app_key, app_secret and the enabled APIs', () => {
    const guide = connectorErrorGuideUtils.guideFor({
      connectorName: '@fema-ipaas/connector-beisen',
      message: 'app_key or app_secret is wrong (Beisen error 40001)',
    });
    expect(guide).toContain('检查 app_key 和 app_secret');
    expect(guide).toContain('开通了哪些接口');
  });

  it('falls back to the connector-wide checklist for an unknown Beisen error', () => {
    const guide = connectorErrorGuideUtils.guideFor({
      connectorName: '@fema-ipaas/connector-beisen',
      message: 'something unexpected',
    });
    expect(guide).toContain('租户在北森管理后台给这个应用开通了哪些接口');
  });

  it('separates Feishu credential, permission and availability failures', () => {
    const credentials = connectorErrorGuideUtils.guideFor({
      connectorName: '@fema-ipaas/connector-feishu',
      message: 'app secret invalid (Feishu error 99991663)',
    });
    const permission = connectorErrorGuideUtils.guideFor({
      connectorName: '@fema-ipaas/connector-feishu',
      message: 'Access denied (Feishu error 99991672)',
    });
    const availability = connectorErrorGuideUtils.guideFor({
      connectorName: '@fema-ipaas/connector-feishu',
      message: 'out of scope (Feishu error 41050)',
    });
    expect(credentials).toContain('检查应用凭证');
    expect(permission).toContain('检查权限范围');
    expect(availability).toContain('检查可用范围');
  });

  it('tells who has to act for the Feishu failures an enterprise meets on the first day', () => {
    const guide = (message: string) =>
      connectorErrorGuideUtils.guideFor({
        connectorName: '@fema-ipaas/connector-feishu',
        message,
      });
    expect(guide('IP not allowed (Feishu error 99991401)')).toContain(
      '检查 IP 白名单',
    );
    expect(guide('HTTP 429: quota used up (Feishu error 99991403)')).toContain(
      '飞书管理员升级版本',
    );
    expect(guide('mobile exists (Feishu error 41001)')).toContain(
      '这个手机号或邮箱在飞书里属于谁',
    );
    expect(guide('no dept (Feishu error 41017)')).toContain('检查部门对照表');
    expect(guide('only +86 (Feishu error 44019)')).toContain(
      '检查人事系统里这位员工的手机号和邮箱',
    );
  });

  it('points a Beisen parameter rejection at the step settings', () => {
    expect(
      connectorErrorGuideUtils.guideFor({
        connectorName: '@fema-ipaas/connector-beisen',
        message: 'OId必须大于等于0 (Beisen code 417)',
      }),
    ).toContain('检查步骤的设置');
  });

  it('has no guide for a connector that did not register one', () => {
    expect(
      connectorErrorGuideUtils.guideFor({
        connectorName: '@fema-ipaas/connector-http',
        message: 'boom',
      }),
    ).toBeNull();
  });

  it('keeps the original text and appends the guide in the connection failure message', () => {
    const message = connectionUtils.failureMessage({
      connectorName: '@fema-ipaas/connector-beisen',
      message: 'app_key or app_secret is wrong (Beisen error 40001)',
    });
    expect(message).toContain('app_key or app_secret is wrong');
    expect(message).toContain('处理办法：检查 app_key 和 app_secret');
  });
});
