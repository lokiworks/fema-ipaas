import { createAction } from '@fema-ipaas/connector-sdk';
import { slackAuth } from '../auth';
import { assertNotNullOrUndefined } from '@fema-ipaas/connector-sdk';
import {
  profilePicture,
  text,
  userId,
  username,
  actions,
  mentionOriginWorkflow,
} from '../common/props';
import { requestAction } from '../common/request-action';
import { requestActionActionOutputSchema } from '../output-schemas';

export const requestActionDirectMessageAction = createAction({
  auth: slackAuth,
  name: 'request_action_direct_message',
  classification: 'WRITE',
  displayName: 'Request Action from A User',
  description:
    'Send a message to a user and wait until the user selects an action',
  audience: 'both',
  aiMetadata: { description: 'Send a direct message with interactive buttons to a user and pause the workflow until that user clicks one of the defined actions, then resume with their choice. Use this for a human-in-the-loop decision via DM; use Request Approval in a Channel for a simple approve/disapprove gate in a channel. Sends a new message each run, so it is not idempotent.', idempotent: false },
  outputSchema: requestActionActionOutputSchema,
  props: {
    userId: userId(true),
    text,
    actions,
    username,
    profilePicture,
    mentionOriginWorkflow,
  },
  async run(context) {
    const { userId } = context.propsValue;
    assertNotNullOrUndefined(userId, 'userId');

    return await requestAction(userId, context);
  },
});
