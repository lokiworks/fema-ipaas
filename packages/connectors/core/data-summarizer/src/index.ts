import { createConnector, ConnectorAuth } from '@fema-ipaas/connector-sdk';
import { calculateAverage } from './lib/actions/calculate-average';
import { calculateSum } from './lib/actions/calculate-sum';
import { countUniques } from './lib/actions/count-uniques';
import { getMinMax } from './lib/actions/get-min-max';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';

export const dataSummarizer = createConnector({
  displayName: 'Data Summarizer',
  description: 'Aggregate lists of values: sum, average, min/max and unique counts',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.30.0',
  logoUrl: '/assets/connectors/data-summarizer.svg',
  authors: ['tahboubali'],
  actions: [calculateAverage, calculateSum, countUniques, getMinMax],
  triggers: [],
  categories: [ConnectorCategory.CORE]
});
