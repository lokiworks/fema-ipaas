import { ConnectorAuth, Property, tryCatch } from '@fema-ipaas/connector-sdk';

import { feishuCommon } from './common';
import { FEISHU_DOMAIN, LARK_DOMAIN } from './constants';

export const feishuAuth = ConnectorAuth.CustomAuth({
  description: "**Set up a Feishu custom app (about 5 minutes)**\n\n1. Open the [Feishu Open Platform](https://open.feishu.cn/app) and create a **custom app** for your organization. Under **Add Features** switch on **Bot** if the workflows will send messages.\n2. On **Credentials & Basic Info**, copy the **App ID** and **App Secret** into the fields below.\n3. On **Permissions & Scopes**, add the permissions for the steps you will use:\n   - Send messages: `im:message:send_as_bot`, plus `im:chat:readonly` so the group chat picker can list chats\n   - Find a member by email or mobile: `contact:user.id:readonly`\n   - Provision, update, suspend or resume accounts: `contact:contact`\n   - Read members and departments back (Get Employee, the List steps): `contact:contact:readonly_as_app`\n   - Bitable: `bitable:app`, then add the app as an editor of the Bitable itself (Share, then Add collaborator)\n4. Still on **Permissions & Scopes**, open the **Data permissions** tab and set the **Contact permission scope** to include every department the workflows touch. Using the company root needs **All members**. A department outside the scope fails with error 40004, a member outside it with error 41050.\n5. If the app has an IP allowlist under **Security Settings**, add this server's outbound IP, or every call fails with error 99991401.\n6. On **Version Management & Release**, create a version and publish it. To message individuals, the **availability scope** of the app must include them. An administrator has to approve the version before permissions and scopes take effect.\n\nSaving checks the App ID and App Secret. A missing permission shows up on the step that needs it, with the permission name in the error. On the free edition, messages count toward the monthly API quota (error 99991403 when it is used up); contact calls do not.",
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
