import { createConnector, ConnectorAuth } from '@fema/connector-sdk';
import { calculateAverage } from './lib/actions/calculate-average';
import { calculateSum } from './lib/actions/calculate-sum';
import { countUniques } from './lib/actions/count-uniques';
import { getMinMax } from './lib/actions/get-min-max';
import { ConnectorCategory } from '@fema/connector-sdk';

export const dataSummarizer = createConnector({
  displayName: 'Data Summarizer',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.fema.local/connectors/data-summarizer.svg',
  authors: ['tahboubali'],
  actions: [calculateAverage, calculateSum, countUniques, getMinMax],
  triggers: [],
  categories: [ConnectorCategory.CORE]
});
