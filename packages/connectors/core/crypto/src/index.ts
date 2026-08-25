import { createConnector, ConnectorAuth } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { generatePassword } from './lib/actions/generate-password';
import { hashText } from './lib/actions/hash-text';
import { hmacSignature } from './lib/actions/hmac-signature';
import { rsaSignature } from './lib/actions/rsa-signature';
import { base64Decode } from './lib/actions/base64-decode';
import { base64Encode } from './lib/actions/base64-encode';
import { openpgpEncrypt } from './lib/actions/openpgp-encrypt';

export const Crypto = createConnector({
  displayName: 'Crypto',
  description: 'Generate random passwords and hash existing text',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.30.0',
  logoUrl: '/assets/connectors/crypto.svg',
  categories: [ConnectorCategory.CORE],
  authors: ['AbdullahBitar', 'kishanprmr', 'abuaboud', 'matthieu-lombard', 'antonyvigouret', 'danielpoonwj', 'prasanna2000-max'],
  actions: [hashText, hmacSignature, rsaSignature, generatePassword, base64Decode, base64Encode, openpgpEncrypt],
  triggers: [],
});
