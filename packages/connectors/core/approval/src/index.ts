import { ConnectorAuth, createConnector } from '@fema/connector-sdk';
import { ConnectorCategory } from '@fema/connector-sdk';
import { createApprovalLink } from './lib/actions/create-approval-link';
import { waitForApprovalLink } from './lib/actions/wait-for-approval';

export const approval = createConnector({
  displayName: 'Approval (Legacy)',
  description: 'Build approval process in your workflows',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.82.0',
  logoUrl: 'https://cdn.fema.local/connectors/new-core/approvals.svg',
  authors: ["kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  categories: [ConnectorCategory.CORE, ConnectorCategory.FLOW_CONTROL],
  actions: [waitForApprovalLink, createApprovalLink],
  triggers: [],
});
