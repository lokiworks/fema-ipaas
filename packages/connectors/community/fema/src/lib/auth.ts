import { ConnectorAuth, OAuth2AuthorizationMethod, OAuth2GrantType, Property } from '@fema-ipaas/connector-sdk';

export const femaAuth = ConnectorAuth.OAuth2({
  displayName: 'FEMA Application',
  description:
    '**Connect as a FEMA service application**\n\n1. In the FEMA console, open **Applications** for your tenant and register a confidential service application with the **client_credentials** grant that only accepts members of your own tenant. A tenant provisioned through the platform API already has one, and its connection is created for you.\n2. Grant the application the objects your workflows read, for example contracts. A business event is only pushed when the application can read the object it is about.\n3. Paste the token endpoint of FEMA IAM, the API address and your tenant code below, then the client ID and secret of the application.\n\nThe tenant code is sent with every token request, so the token only ever acts for your tenant. A code of another tenant is refused by FEMA IAM with invalid_target.',
  required: true,
  grantType: OAuth2GrantType.CLIENT_CREDENTIALS,
  authorizationMethod: OAuth2AuthorizationMethod.BODY,
  authUrl: '',
  tokenUrl: '{tokenUrl}',
  scope: [],
  props: {
    tokenUrl: Property.ShortText({
      displayName: 'Token URL',
      description: 'The token endpoint of FEMA IAM, for example https://iam.example.com/oauth2/token.',
      required: true,
    }),
    apiUrl: Property.ShortText({
      displayName: 'API URL',
      description: 'The address FEMA business APIs are served from, for example https://api.example.com.',
      required: true,
    }),
    tenant: Property.ShortText({
      displayName: 'Tenant Code',
      description: 'The code of your tenant in FEMA IAM. It is sent as the tenant parameter of every token request.',
      required: true,
    }),
  },
  getConnectionIdentifier: async ({ auth }) => {
    const tenant = auth.props?.['tenant'];
    return typeof tenant === 'string' && tenant.length > 0 ? tenant : undefined;
  },
});
