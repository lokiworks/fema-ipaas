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
});
