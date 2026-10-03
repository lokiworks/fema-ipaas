import { readFileSync } from 'fs';
import path from 'path';

import i18n from 'i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { failureText } from '@/features/issues/utils/failure-text';

const zh = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../public/locales/zh/translation.json'),
    'utf-8',
  ),
);

describe('failureText.localize', () => {
  beforeAll(async () => {
    i18n.addResourceBundle('zh', 'translation', zh);
    await i18n.changeLanguage('zh');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('translates the platform messages that end up in issue titles', () => {
    expect(failureText.localize('Sync · Call API: Route not found')).toBe(
      'Sync · Call API: 对方系统没有这个接口地址（Route not found）',
    );
    expect(failureText.localize('Sync · Call API: Too many requests')).toBe(
      'Sync · Call API: 对方系统限制了调用频率（Too many requests）',
    );
    expect(
      failureText.localize(
        'Sync · Step 1: The run timed out before this step finished',
      ),
    ).toBe('Sync · Step 1: 运行超时，这一步还没有跑完');
  });

  it('translates the plain HTTP reason phrases', () => {
    expect(failureText.localize('A · B: Bad Gateway')).toBe(
      'A · B: 对方系统的网关连不上后端（Bad Gateway）',
    );
  });

  it('translates Feishu hints and the error code suffix', () => {
    expect(
      failureText.localize(
        'Onboard · Create user: no auth — the app is missing the permission this endpoint needs, grant it in the Open Platform and republish the app (Feishu error 99991672)',
      ),
    ).toBe(
      'Onboard · Create user: no auth — 应用缺少这个接口需要的权限，请到开放平台开通并重新发布应用 （飞书错误码 99991672）',
    );
  });

  it('keeps messages it does not know untouched', () => {
    expect(failureText.localize('A · B: Something custom failed')).toBe(
      'A · B: Something custom failed',
    );
  });

  it('does not rewrite a workflow whose name merely contains a known phrase', () => {
    expect(
      failureText.localize('Route not found handler · Step: timeout'),
    ).toBe('Route not found handler · Step: timeout');
  });

  it('shows the English wording in an English interface', async () => {
    await i18n.changeLanguage('en');
    expect(failureText.localize('A · B: Route not found')).toBe(
      'A · B: The address does not exist on the other system (Route not found)',
    );
    await i18n.changeLanguage('zh');
  });
});
