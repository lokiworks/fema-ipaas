import { ConnectorPropValueSchema } from '@fema/connector-sdk';
import { rabbitmqAuth } from '../auth';
import amqp, { ChannelModel, Connection } from 'amqplib';

export async function rabbitmqConnect(
  auth: ConnectorPropValueSchema<typeof rabbitmqAuth>,
): Promise<ChannelModel> {
  return amqp.connect(createAmqpURI(auth), (err: Error, conn: Connection) => {
    if (err) {
      throw err;
    }

    return conn;
  });
}

function createAmqpURI(auth: ConnectorPropValueSchema<typeof rabbitmqAuth>): string {
  const uri = `amqp://${auth.username}:${auth.password}@${auth.host}:${auth.port}`;

  if (!auth.vhost) {
    return uri;
  }
  return `${uri}/${auth.vhost}`;
}
