import assert from 'node:assert';
import { ConnectorMetadata } from '../../../packages/connectors/sdk/src';
import { StatusCodes } from 'http-status-codes';
import { HttpHeader } from '../../../packages/connectors/common/src';
import { FEMA_CLOUD_API_BASE, findNewConnectors, connectorMetadataExists } from '../utils/connector-script-utils';
import { chunk } from '@fema-ipaas/core-utils';
assert(process.env['FEMA_CLOUD_API_KEY'], 'API Key is not defined');

const { FEMA_CLOUD_API_KEY } = process.env;

const insertConnectorMetadata = async (
  connectorMetadata: ConnectorMetadata
): Promise<void> => {
  const body = JSON.stringify(connectorMetadata);

  const headers = {
    ['api-key']: FEMA_CLOUD_API_KEY,
    [HttpHeader.CONTENT_TYPE]: 'application/json'
  };

  const cloudResponse = await fetch(`${FEMA_CLOUD_API_BASE}/admin/connectors`, {
    method: 'POST',
    headers,
    body
  });

  if (cloudResponse.status !== StatusCodes.OK && cloudResponse.status !== StatusCodes.CONFLICT) {
    throw new Error(await cloudResponse.text());
  }
};



const insertMetadataIfNotExist = async (connectorMetadata: ConnectorMetadata) => {
  console.info(
    `insertMetadataIfNotExist, name: ${connectorMetadata.name}, version: ${connectorMetadata.version}`
  );

  const metadataAlreadyExist = await connectorMetadataExists(
    connectorMetadata.name,
    connectorMetadata.version
  );

  if (metadataAlreadyExist) {
    console.info(`insertMetadataIfNotExist, connector metadata already inserted`);
    return;
  }

  await insertConnectorMetadata(connectorMetadata);
};

const insertMetadata = async (connectorsMetadata: ConnectorMetadata[]) => {
  const batches = chunk(connectorsMetadata, 30)
  for (const batch of batches) {
    await Promise.all(batch.map(insertMetadataIfNotExist))
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
};

const main = async () => {
  console.log('update connectors metadata: started')

  const { connectors, failures } = await findNewConnectors()

  if (failures.length > 0) {
    console.error(`update connectors metadata: ${failures.length} connector(s) failed to load:`)
    for (const failure of failures) {
      console.error(`  - ${failure.path}: ${failure.error}`)
    }
  }

  await insertMetadata(connectors)

  if (failures.length > 0) {
    process.exit(1)
  }

  console.log('update connectors metadata: completed')
  process.exit()
}

main()
