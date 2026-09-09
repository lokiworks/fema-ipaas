import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuCommon } from '../common';

export const findUser = createAction({
  auth: feishuAuth,
  name: 'find_user',
  displayName: 'Find User',
  description: 'Exchange a work email or mobile number for a Feishu open_id',
  audience: 'both',
  classification: 'SEARCH',
  aiMetadata: {
    description:
      'Look up a Feishu/Lark user by work email or mobile number and return their open_id and user_id. Pick this when a later step needs a user identifier but you only hold an email or phone number. Requires the contact:user.id:readonly permission, and returns an empty result rather than failing when nobody matches.',
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
      description: 'Mobile numbers need the country code, for example +8613800000000.',
      required: true,
    }),
  },
  async run(context) {
    const { lookupBy, value } = context.propsValue;
    const data = await feishuCommon.callApi<BatchGetIdResponse>({
      auth: context.auth,
      method: HttpMethod.POST,
      path: '/open-apis/contact/v3/users/batch_get_id',
      queryParams: { user_id_type: 'open_id' },
      body: lookupBy === 'email' ? { emails: [value] } : { mobiles: [value] },
    });
    const match = (data.user_list ?? []).find((user) => user.user_id);
    return {
      found: Boolean(match),
      open_id: match?.user_id ?? null,
      email: match?.email ?? null,
      mobile: match?.mobile ?? null,
    };
  },
});

type BatchGetIdResponse = {
  user_list?: { user_id?: string; email?: string; mobile?: string }[];
};
