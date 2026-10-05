import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuContacts } from '../common/contacts';

export const resumeUser = createAction({
  auth: feishuAuth,
  name: 'resume_user',
  displayName: 'Resume Employee Account',
  description: 'Lift the suspension of an employee account so they can sign in again',
  audience: 'both',
  classification: 'WRITE',
  aiMetadata: {
    description:
      'Resume a suspended Feishu/Lark member by sending is_frozen=false to the update-user endpoint: they can sign in again and see everything from the suspension period. The result reads the account back, so confirmed=true means Feishu now reports is_frozen as asked. Safe to repeat. Use it to undo a suspension that was applied by mistake or when an employee returns. Feishu limits this to one call per second. Needs the "Update contacts" permission, and the member must be inside the app\'s contact scope.',
    idempotent: true,
  },
  props: {
    openId: Property.ShortText({
      displayName: 'Member Open ID',
      description: 'The open_id of the suspended member.',
      required: true,
    }),
  },
  async run(context) {
    return feishuContacts.setUserSuspended({
      auth: context.auth,
      input: { openId: context.propsValue.openId, suspended: false },
    });
  },
});
