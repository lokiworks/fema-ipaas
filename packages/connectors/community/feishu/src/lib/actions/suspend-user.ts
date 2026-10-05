import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuOutputSchemas } from '../output-schemas';
import { feishuContacts } from '../common/contacts';

export const suspendUser = createAction({
  auth: feishuAuth,
  name: 'suspend_user',
  displayName: 'Suspend Employee Account',
  description: 'Suspend a leaving employee so they can no longer sign in, keeping all their data',
  audience: 'both',
  outputSchema: feishuOutputSchemas.setSuspended,
  classification: 'WRITE',
  aiMetadata: {
    description:
      'Suspend a Feishu/Lark member by sending is_frozen=true to the update-user endpoint: they can no longer sign in, their documents, chats and calendars are kept, and the account can be resumed later. It does not delete anything and a suspended account still takes up a seat until an administrator offboards the member. The result reads the account back, so confirmed=true means Feishu now reports is_frozen as asked. Safe to repeat: suspending an already suspended member changes nothing. Feishu limits this to one call per second and rejects overlapping calls with error 44025, so let a retry run it again. The tenant creator cannot be suspended (error 44036). Needs the "Update contacts" permission, and the member must be inside the app\'s contact scope.',
    idempotent: true,
  },
  props: {
    openId: Property.ShortText({
      displayName: 'Member Open ID',
      description: 'The open_id of the leaving member, from Find User or Provision Employee Account.',
      required: true,
    }),
  },
  async run(context) {
    return feishuContacts.setUserSuspended({
      auth: context.auth,
      input: { openId: context.propsValue.openId, suspended: true },
    });
  },
});
