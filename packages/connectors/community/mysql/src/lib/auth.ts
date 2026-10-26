import { ConnectorAuth, Property } from '@fema-ipaas/connector-sdk';

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

