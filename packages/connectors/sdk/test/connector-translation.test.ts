import { LocalesEnum } from '@fema-ipaas/core-utils';
import { describe, expect, it } from 'vitest';
import { connectorTranslation } from '../src/lib/i18n';
import { ConnectorMetadataModel } from '../src/lib/connector-metadata';

const connectorWithTwoAuths = {
  name: 'two-auths',
  displayName: 'Server',
  description: 'A server',
  auth: [
    {
      description: 'Sign in with a token',
      props: {
        url: { displayName: 'Server URL', description: 'Where it lives' },
        mode: {
          displayName: 'Mode',
          options: { options: [{ label: 'Fast', value: 'fast' }] },
        },
      },
    },
    { description: 'Sign in with OAuth', props: {} },
  ],
  actions: {},
  triggers: {},
  i18n: {
    [LocalesEnum.CHINESE_SIMPLIFIED]: {
      Server: '服务',
      'Sign in with a token': '用令牌登录',
      'Sign in with OAuth': '用 OAuth 登录',
      'Server URL': '服务地址',
      'Where it lives': '它在哪里',
      Mode: '模式',
      Fast: '快速',
    },
  },
};

describe('connectorTranslation.translateConnector', () => {
  it('translates the properties of every auth when a connector offers several', () => {
    const translated = connectorTranslation.translateConnector({
      connector: JSON.parse(JSON.stringify(connectorWithTwoAuths)) as ConnectorMetadataModel,
      locale: LocalesEnum.CHINESE_SIMPLIFIED,
    });

    expect(translated).toMatchObject({
      displayName: '服务',
      auth: [
        {
          description: '用令牌登录',
          props: {
            url: { displayName: '服务地址', description: '它在哪里' },
            mode: { displayName: '模式', options: { options: [{ label: '快速', value: 'fast' }] } },
          },
        },
        { description: '用 OAuth 登录' },
      ],
    });
  });

  it('translates the display name of each auth method', () => {
    const translated = connectorTranslation.translateConnector<ConnectorMetadataModel>({
      connector: JSON.parse(JSON.stringify({
        ...connectorWithTwoAuths,
        auth: [
          { ...connectorWithTwoAuths.auth[0], displayName: 'Connection' },
          { ...connectorWithTwoAuths.auth[1], displayName: 'Server URL' },
        ],
        i18n: {
          [LocalesEnum.CHINESE_SIMPLIFIED]: {
            ...connectorWithTwoAuths.i18n[LocalesEnum.CHINESE_SIMPLIFIED],
            Connection: '连接',
          },
        },
      })),
      locale: LocalesEnum.CHINESE_SIMPLIFIED,
    });

    expect(translated).toMatchObject({
      auth: [{ displayName: '连接' }, { displayName: '服务地址' }],
    });
  });
});

describe('connectorTranslation.translateConnector output schemas', () => {
  it('translates nested output field labels and keeps the source label', () => {
    const translated = connectorTranslation.translateConnector<ConnectorMetadataModel>({
      connector: JSON.parse(JSON.stringify({
        ...connectorWithTwoAuths,
        actions: {
          read: {
            name: 'read',
            displayName: 'Read',
            props: {},
            outputSchema: {
              fields: [
                {
                  key: 'recordInfo',
                  label: 'Employment Record',
                  children: [{ key: 'jobNumber', label: 'Job Number', description: 'The employee number.' }],
                },
                { key: 'records', label: 'Employees', listItems: [{ key: 'mobile', label: 'Mobile' }] },
                { key: 'untranslated', label: 'Untranslated' },
              ],
            },
          },
        },
        i18n: {
          [LocalesEnum.CHINESE_SIMPLIFIED]: {
            'Employment Record': '任职记录',
            'Job Number': '工号',
            'The employee number.': '员工的工号。',
            Employees: '员工列表',
            Mobile: '手机号',
          },
        },
      })),
      locale: LocalesEnum.CHINESE_SIMPLIFIED,
    });

    expect(translated.actions['read'].outputSchema?.fields).toEqual([
      {
        key: 'recordInfo',
        label: '任职记录',
        sourceLabel: 'Employment Record',
        children: [{ key: 'jobNumber', label: '工号', sourceLabel: 'Job Number', description: '员工的工号。' }],
      },
      { key: 'records', label: '员工列表', sourceLabel: 'Employees', listItems: [{ key: 'mobile', label: '手机号', sourceLabel: 'Mobile' }] },
      { key: 'untranslated', label: 'Untranslated' },
    ]);
  });
});
