import { createConnector, ConnectorAuth } from '@fema-ipaas/connector-sdk';
import { callWorkflow } from './lib/actions/call-workflow';
import { streamCsvToSubflows } from './lib/actions/stream-csv-to-workflow';
import { callableWorkflow } from './lib/triggers/callable-workflow';
import { response } from './lib/actions/respond';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';

export const workflows = createConnector({
  displayName: 'Sub Workflows',
  description: 'Trigger and call another sub workflow.',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.82.0',
  categories: [ConnectorCategory.CORE, ConnectorCategory.WORKFLOW_CONTROL],
  logoUrl: '/assets/connectors/subflows.svg',
  authors: ['hazemadelkhalel'],
  actions: [callWorkflow, streamCsvToSubflows, response],
  triggers: [callableWorkflow],
});
