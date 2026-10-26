import { createConnector, ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { mysqlAuth } from './lib/auth';
import actions from './lib/actions';
import { newRow } from './lib/triggers/new-row';

export const mysql = createConnector({
  displayName: 'MySQL',
  description: "The world's most popular open-source database",

  minimumSupportedRelease: '0.30.0',
  logoUrl: '/assets/connectors/mysql.svg',
  categories: [ConnectorCategory.DEVELOPER_TOOLS],
  authors: ["JanHolger","kishanprmr","khaledmashaly","abuaboud"],
  auth: mysqlAuth,
  actions,
  triggers: [newRow],
});
