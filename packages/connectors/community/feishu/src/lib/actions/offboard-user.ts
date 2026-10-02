import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuContacts } from '../common/contacts';

export const offboardUser = createAction({
  auth: feishuAuth,
  name: 'offboard_user',
  displayName: 'Offboard Employee',
  description: 'Remove a leaving employee from Feishu and hand their chats, documents and calendars to someone else',
  audience: 'both',
  classification: 'DESTRUCTIVE',
  aiMetadata: {
    description:
      'Offboard a Feishu/Lark member: the account is deleted from the contact directory, which is how Feishu handles a leaver, and their group chats, documents, calendars, apps, minutes and surveys are transferred to the receiver you name. Feishu keeps a deleted member recoverable for a limited time through its restore call, but treat this as destructive and run it only for confirmed leavers. Repeating it for a member who is already gone fails. Needs the "Update contacts" permission.',
    idempotent: false,
  },
  props: {
    openId: Property.ShortText({
      displayName: 'Member Open ID',
      description: 'The open_id of the leaving member, from Find User or Provision Employee Account.',
      required: true,
    }),
    receiverOpenId: Property.ShortText({
      displayName: 'Resource Receiver Open ID',
      description: 'The open_id of the person who takes over the member\'s chats, documents, calendars and apps, usually the direct manager. Leave empty to let Feishu apply its default handling.',
      required: false,
    }),
  },
  async run(context) {
    const { openId, receiverOpenId } = context.propsValue;
    return feishuContacts.offboardUser({
      auth: context.auth,
      input: { openId, receiverOpenId },
    });
  },
});
