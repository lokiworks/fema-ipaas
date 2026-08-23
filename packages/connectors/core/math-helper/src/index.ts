import { createConnector, ConnectorAuth, ConnectorCategory } from '@fema/connector-sdk';
import { addition } from './lib/actions/addition';
import { division } from './lib/actions/division';
import { generateRandom } from './lib/actions/generateRandom';
import { modulo } from './lib/actions/modulo';
import { multiplication } from './lib/actions/multiplication';
import { subtraction } from './lib/actions/subtraction';

const markdownDescription = `
Perform mathematical operations.
`;

export const math = createConnector({
  displayName: 'Math Helper',
  description: markdownDescription,
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.fema.local/connectors/new-core/math-helper.svg',
  categories: [ConnectorCategory.CORE],
  authors: ["kishanprmr","MoShizzle","abuaboud"],
  actions: [
    addition,
    subtraction,
    multiplication,
    division,
    modulo,
    generateRandom,
  ],
  triggers: [],
});
