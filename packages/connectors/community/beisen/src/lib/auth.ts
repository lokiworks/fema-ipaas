import { ConnectorAuth, Property, tryCatch } from '@fema-ipaas/connector-sdk';

import { beisenCommon } from './common';

export const beisenAuth = ConnectorAuth.CustomAuth({
  description:
    'Open the Beisen admin console, go to My Connectors, create a connector and copy its Key and Secret. If that menu is missing, ask your Beisen project manager to enable Open Platform access.',
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
