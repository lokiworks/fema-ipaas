import { isNil } from '@fema-ipaas/core-utils';
import deepEqual from 'deep-equal';

function isConnectorSample({
  sampleData,
  connectorSample,
}: {
  sampleData: unknown;
  connectorSample: unknown;
}): boolean {
  if (isNil(sampleData) || isNil(connectorSample)) {
    return false;
  }
  if (JSON.stringify(connectorSample) === '{}') {
    return false;
  }
  return deepEqual(sampleData, connectorSample, { strict: true });
}

export const connectorSampleData = { isConnectorSample };
