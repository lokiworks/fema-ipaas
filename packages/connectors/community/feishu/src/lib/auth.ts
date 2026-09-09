import { ConnectorAuth, Property, tryCatch } from '@fema-ipaas/connector-sdk';

import { feishuCommon } from './common';
import { FEISHU_DOMAIN, LARK_DOMAIN } from './constants';

export const feishuAuth = ConnectorAuth.CustomAuth({
  description:
    'Create a custom app in the Feishu Open Platform, then copy the App ID and App Secret from the Credentials page. The app must be published and approved by an administrator; each action lists the permission it needs.',
  props: {
    domain: Property.StaticDropdown({
      displayName: 'Region',
      description: 'Choose Feishu for mainland China, Lark for the international edition.',
      required: true,
      defaultValue: FEISHU_DOMAIN,
      options: {
        options: [
          { label: 'Feishu (mainland China)', value: FEISHU_DOMAIN },
          { label: 'Lark (international)', value: LARK_DOMAIN },
        ],
      },
    }),
    appId: Property.ShortText({
      displayName: 'App ID',
      description: 'Looks like cli_a1b2c3d4e5f6g7h8.',
      required: true,
    }),
    appSecret: ConnectorAuth.SecretText({
      displayName: 'App Secret',
      required: true,
    }),
  },
  required: true,
  validate: async ({ auth }) => {
    const { error } = await tryCatch(() =>
      feishuCommon.obtainTenantAccessToken({
        domain: auth.domain,
        appId: auth.appId,
        appSecret: auth.appSecret,
      }),
    );
    if (error) {
      return { valid: false, error: error.message };
    }
    return { valid: true };
  },
});
