import { createAction, Property } from '@fema-ipaas/connector-sdk';
import { slackAuth } from '../auth';
import { blocks, singleSelectChannelInfo, slackChannel, mentionOriginWorkflow } from '../common/props';
import { buildWorkflowOriginContextBlock, processMessageTimestamp, textToSectionBlocks } from '../common/utils';
import { Block,KnownBlock, WebClient } from '@slack/web-api';
import { getBotToken, SlackAuthValue } from '../common/auth-helpers';
import { chatUpdateOutputSchema } from '../output-schemas';

export const updateMessage = createAction({
  // auth: check https://github.com/lokiworks/fema-ipaas/docs/developers/connector-reference/authentication,
  name: 'updateMessage',
  classification: 'WRITE',
  displayName: 'Update message',
  description: 'Update an existing message',
  audience: 'human',
  aiMetadata: {
    description:
      'Edit an already-posted Slack message in place, replacing its text and blocks, identified by channel and message timestamp (ts). Pick this to revise content the workflow previously sent rather than posting a new one; use Delete Message to remove it instead. Idempotent: re-running with the same inputs leaves the message in the same final state.',
    idempotent: true,
  },
  auth: slackAuth,
  outputSchema: chatUpdateOutputSchema,
  props: {
    info: singleSelectChannelInfo,
    channel: slackChannel(true),
    ts: Property.ShortText({
      displayName: 'Message Timestamp',
      description:
        'Please provide the timestamp of the message you wish to update, such as `1710304378.475129`. Alternatively, you can easily obtain the message link by clicking on the three dots next to the message and selecting the `Copy link` option.',
      required: true,
    }),
    text: Property.LongText({
      displayName: 'Message',
      description: 'The updated text of your message',
      required: true,
    }),
    mentionOriginWorkflow,
    blocks,
  },
  async run(context) {
    const { auth, propsValue } = context;
    const messageTimestamp = processMessageTimestamp(propsValue.ts);
    if (!messageTimestamp) {
      throw new Error('Invalid Timestamp Value.');
    }
    const client = new WebClient(getBotToken(auth as SlackAuthValue));

    const blockList: (KnownBlock | Block)[] = [...textToSectionBlocks(propsValue.text)];

    if (propsValue.blocks && Array.isArray(propsValue.blocks) && propsValue.blocks.length > 0) {
      blockList.push(...(propsValue.blocks as unknown as (KnownBlock | Block)[]));
    }

    if (propsValue.mentionOriginWorkflow) {
      blockList.push(buildWorkflowOriginContextBlock(context));
    }

    return await client.chat.update({
      channel: propsValue.channel,
      ts: messageTimestamp,
      text: propsValue.text,
      blocks: blockList,
    });
  },
});
