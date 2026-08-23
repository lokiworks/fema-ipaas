import { ConnectorAuth, Property } from '@fema-ipaas/connector-sdk';

export const rabbitmqAuth = ConnectorAuth.CustomAuth({
  description: "Rabbitmq Auth",
  required: true,
  props: {
    host: Property.ShortText({
      displayName: "Host",
      description: "Host",
      required: true,
    }),
    username: Property.ShortText({
      displayName: "Username",
      description: "Username",
      required: true,
    }),
    password: ConnectorAuth.SecretText({
      displayName: "Password",
      description: "Password",
      required: true,
    }),
    port: Property.Number({
      displayName: "Port",
      description: "Port",
      required: true,
    }),
    vhost: Property.ShortText({
      displayName: "Virtual Host",
      description: "Virtual Host",
      required: false,
    }),
  },
});
