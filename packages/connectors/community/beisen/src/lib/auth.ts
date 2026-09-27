import { ConnectorAuth, Property, tryCatch } from '@fema-ipaas/connector-sdk';

import { beisenCommon } from './common';

export const beisenAuth = ConnectorAuth.CustomAuth({
  description: "**Set up a Beisen connector**\n\n1. In the Beisen admin console, open **My Connectors** and create a connector.\n2. Copy its **Key** and **Secret** into the fields below.\n3. Grant the connector the data the steps read: employee records, organizations, and recruiting.\n\nIf **My Connectors** is missing, ask your Beisen project manager to enable Open Platform access. Saving checks the Key and Secret.",
  props: {
    appKey: Property.ShortText({
      displayName: 'App Key',
      description: 'The Key of the Beisen connector.',
      required: true,
    }),
    appSecret: ConnectorAuth.SecretText({
      displayName: 'App Secret',
      description: 'The Secret of the Beisen connector.',
      required: true,
    }),
  },
  required: true,
  validate: async ({ auth }) => {
    const { error } = await tryCatch(() =>
      beisenCommon.obtainAccessToken({
        appKey: auth.appKey,
        appSecret: auth.appSecret,
      }),
    );
    if (error) {
      return { valid: false, error: error.message };
    }
    return { valid: true };
  },
});
