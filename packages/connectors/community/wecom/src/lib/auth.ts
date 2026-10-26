import { ConnectorAuth, Property, tryCatch } from '@fema-ipaas/connector-sdk';
import { wecomCommon } from './common';

export const wecomAuth = ConnectorAuth.CustomAuth({
  required: true,
  description: 'In the WeCom admin console, open My enterprise → Enterprise information for Corp ID. Under Management tools → Contact synchronization, enable API editing and copy the Contact Secret for directory writes and ID enumeration. Under App management → your internal app, copy its Secret and Agent ID for member reads and messaging. Include all synchronized departments in the app visibility scope. Configure the server outbound IP under the application trusted IP list. New contact-sync IPs cannot call legacy member-read APIs; an application Secret is required for Get User. Sensitive mobile/email fields may require employee consent; mobile/email ID lookups use the contact Secret. Robot webhook keys are optional and only used by the robot action.',
  props: {
    corpId: Property.ShortText({ displayName: 'Corp ID', required: true }),
    contactSecret: ConnectorAuth.SecretText({ displayName: 'Contact synchronization Secret', required: false }),
    appSecret: ConnectorAuth.SecretText({ displayName: 'Application Secret', required: true }),
    agentId: Property.ShortText({ displayName: 'Agent ID', required: false }),
    robotKey: ConnectorAuth.SecretText({ displayName: 'Group robot webhook key', required: false }),
  },
  async validate({ auth }) {
    const { error } = await tryCatch(async () => {
      await wecomCommon.obtainAccessToken({ auth, purpose: 'app' });
      if (auth.contactSecret) await wecomCommon.obtainAccessToken({ auth, purpose: 'contact' });
    });
    return error ? { valid: false, error: error.message } : { valid: true };
  },
});
