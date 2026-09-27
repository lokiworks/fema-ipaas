import { ConnectorAuth, Property, tryCatch } from '@fema-ipaas/connector-sdk';

import { feishuCommon } from './common';
import { FEISHU_DOMAIN, LARK_DOMAIN } from './constants';

export const feishuAuth = ConnectorAuth.CustomAuth({
  description: "**Set up a Feishu custom app (about 5 minutes)**\n\n1. Open the [Feishu Open Platform](https://open.feishu.cn/app) and create a **custom app** for your organization.\n2. On **Credentials & Basic Info**, copy the **App ID** and **App Secret** into the fields below.\n3. On **Permissions & Scopes**, add the permissions for the steps you will use:\n   - Send messages: `im:message:send_as_bot`\n   - Find users or provision accounts: `contact:user.id:readonly`\n   - Provision accounts: `contact:contact`, and add the target departments to the app's contact scope\n   - Bitable: `bitable:app`\n4. On **Version Management & Release**, create a version and publish it. An administrator has to approve it before the permissions take effect.\n\nSaving checks the App ID and App Secret. A missing permission shows up on the step that needs it, with the permission name in the error.",
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
