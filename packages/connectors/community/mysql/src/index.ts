import {
  ConnectorAuth,
  Property,
  createConnector,
} from '@fema/connector-sdk';
import { ConnectorCategory } from '@fema/connector-sdk';
import actions from './lib/actions';

export const mysqlAuth = ConnectorAuth.CustomAuth({
  props: {
    host: Property.ShortText({
      displayName: 'Host',
      required: true,
      description: 'The hostname or address of the mysql server',
    }),
    port: Property.Number({
      displayName: 'Port',
      defaultValue: 3306,
      description: 'The port to use for connecting to the mysql server',
      required: true,
    }),
    user: Property.ShortText({
      displayName: 'Username',
      required: true,
      description: 'The username to use for connecting to the mysql server',
    }),
    password: ConnectorAuth.SecretText({
      displayName: 'Password',
      description: 'The password to use to identify at the mysql server',
      required: true,
    }),
    database: Property.ShortText({
      displayName: 'Database',
      description: 'The name of the database to use. Required if you are not using the "Execute Query" Action',
      required: false,
    }),
  },
  required: true,
});

export const mysql = createConnector({
  displayName: 'MySQL',
  description: "The world's most popular open-source database",

  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.fema.local/connectors/mysql.png',
  categories: [ConnectorCategory.DEVELOPER_TOOLS],
  authors: ["JanHolger","kishanprmr","khaledmashaly","abuaboud"],
  auth: mysqlAuth,
  actions,
  triggers: [],
});
