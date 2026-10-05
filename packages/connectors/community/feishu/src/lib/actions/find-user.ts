import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuOutputSchemas } from '../output-schemas';
import { feishuContacts } from '../common/contacts';

export const findUser = createAction({
  auth: feishuAuth,
  name: 'find_user',
  displayName: 'Find User',
  description: 'Exchange a work email or mobile number for a Feishu open_id',
  audience: 'both',
  outputSchema: feishuOutputSchemas.findUser,
  classification: 'SEARCH',
  aiMetadata: {
    description:
      'Look up a Feishu/Lark user by email or mobile number and return their open_id plus whether the account is suspended or resigned. Pick this when a later step needs a user identifier but you only hold an email or phone number, or to check whether an account already exists before provisioning. Requires the contact:user.id:readonly permission, only sees members inside the app contact scope, cannot look up an enterprise mailbox, and returns found=false rather than failing when nobody matches. Resigned members are skipped unless asked for.',
    idempotent: true,
  },
  props: {
    lookupBy: Property.StaticDropdown({
      displayName: 'Look Up By',
      required: true,
      defaultValue: 'email',
      options: {
        options: [
          { label: 'Work email', value: 'email' },
          { label: 'Mobile number', value: 'mobile' },
        ],
      },
    }),
    value: Property.ShortText({
      displayName: 'Email or Mobile',
      description: 'An 11-digit mainland number is fine as it is; other mobile numbers need the country code, for example +85260000000.',
      required: true,
    }),
    includeResigned: Property.Checkbox({
      displayName: 'Include Resigned Members',
      description: 'Also return members who have resigned. Off by default, as Feishu does.',
      required: false,
      defaultValue: false,
    }),
  },
  async run(context) {
    const { lookupBy, value, includeResigned } = context.propsValue;
    const match = await feishuContacts.lookupUser({
      auth: context.auth,
      mobile: lookupBy === 'mobile' ? value : undefined,
      email: lookupBy === 'email' ? value : undefined,
      includeResigned: includeResigned === true,
    });
    return {
      found: match !== null,
      open_id: match?.openId ?? null,
      email: match?.email ?? null,
      mobile: match?.mobile ?? null,
      is_frozen: match?.isFrozen ?? null,
      is_resigned: match ? match.isResigned : null,
    };
  },
});
