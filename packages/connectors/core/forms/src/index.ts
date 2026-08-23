import { createConnector, ConnectorAuth } from '@fema/connector-sdk';
import { ConnectorCategory } from '@fema/connector-sdk';
import { onChatSubmission } from './lib/triggers/chat-trigger';
import { onFormSubmission } from './lib/triggers/form-trigger';
import { returnResponse } from './lib/actions/return-response';

export const forms = createConnector({
  displayName: 'Human Input',
  description: 'Trigger a workflow through human input.',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.65.0',
  categories: [ConnectorCategory.CORE],
  logoUrl: 'https://cdn.fema.local/connectors/new-core/human-input.svg',
  authors: ['anasbarg', 'MoShizzle', 'abuaboud'],
  actions: [returnResponse],
  triggers: [onFormSubmission, onChatSubmission],
});
