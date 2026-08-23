import {
  CustomAuthProps,
  OIDCAuthProps,
  OAuth2Props,
  ConnectorAuthProperty,
  ConnectorMetadataModel,
  ConnectorMetadataModelSummary,
  PropertyType,
} from '@fema/connector-sdk';
import { assertNotNullOrUndefined, isNil, apId } from '@fema/core-utils';
import {
  ConnectionType,
  ConnectionWithoutSensitiveData,
  UpsertConnectionRequestBody,
  ConnectionStatus,
  OAuth2GrantType,
} from '@fema/shared';
import { t } from 'i18next';
import { CheckIcon, UnplugIcon, XIcon } from 'lucide-react';

import { OAuth2App } from '@/features/connections/utils/oauth2-utils';
import { formUtils } from '@/features/connectors/utils/form-utils';
import { authenticationSession } from '@/lib/authentication-session';

import { connectionsApi } from '../api/connections';
import { globalConnectionsApi } from '../api/global-connections';

export class ConnectionNameAlreadyExists extends Error {
  constructor() {
    super(t('Connection name already used'));
    this.name = 'ConnectionNameAlreadyExists';
  }
}

export class NoWorkspaceSelected extends Error {
  constructor() {
    super(t('Please select at least one workspace'));
    this.name = 'NoWorkspaceSelected';
  }
}

export const connectionUtils = {
  getStatusIcon(status: ConnectionStatus): {
    variant: 'default' | 'success' | 'error';
    icon: React.ComponentType;
  } {
    switch (status) {
      case ConnectionStatus.ACTIVE:
        return {
          variant: 'success',
          icon: CheckIcon,
        };
      case ConnectionStatus.MISSING:
        return {
          variant: 'default',
          icon: UnplugIcon,
        };
      case ConnectionStatus.ERROR:
        return {
          variant: 'error',
          icon: XIcon,
        };
    }
  },
  getConnectionAccountIdentifier(
    connection: ConnectionWithoutSensitiveData,
  ): string | undefined {
    const accountIdentifier = connection.metadata?.accountIdentifier;
    return typeof accountIdentifier === 'string' && accountIdentifier.length > 0
      ? accountIdentifier
      : undefined;
  },
};

export const newConnectionUtils = {
  getConnectionName(
    connector: ConnectorMetadataModelSummary | ConnectorMetadataModel,
    reconnectConnection: ConnectionWithoutSensitiveData | null,
    externalIdComingFromSdk?: string | null,
  ): {
    externalId: string;
    displayName: string;
  } {
    if (reconnectConnection) {
      return {
        externalId: reconnectConnection.externalId,
        displayName: reconnectConnection.displayName,
      };
    }
    if (externalIdComingFromSdk) {
      return {
        externalId: externalIdComingFromSdk,
        displayName: externalIdComingFromSdk,
      };
    }

    return {
      externalId: apId(),
      displayName: connector.displayName,
    };
  },

  createDefaultValues({
    auth,
    suggestedExternalId,
    suggestedDisplayName,
    connectorName,
    grantType,
    oauth2App,
    redirectUrl,
    workspaceId: workspaceIdOverride,
  }: DefaultValuesParams): Partial<UpsertConnectionRequestBody> {
    const workspaceId =
      workspaceIdOverride ?? authenticationSession.getWorkspaceId();
    assertNotNullOrUndefined(workspaceId, 'workspaceId');
    if (!auth) {
      throw new Error(`Unsupported property type: ${auth}`);
    }
    const commmonProps = {
      externalId: suggestedExternalId,
      displayName: suggestedDisplayName,
      connectorName: connectorName,
      workspaceId,
    };

    switch (auth.type) {
      case PropertyType.SECRET_TEXT:
        return {
          ...commmonProps,
          type: ConnectionType.SECRET_TEXT,
          value: {
            type: ConnectionType.SECRET_TEXT,
            secret_text: '',
          },
        };
      case PropertyType.BASIC_AUTH:
        return {
          ...commmonProps,
          type: ConnectionType.BASIC_AUTH,
          value: {
            type: ConnectionType.BASIC_AUTH,
            username: '',
            password: '',
          },
        };
      case PropertyType.CUSTOM_AUTH: {
        return {
          ...commmonProps,
          type: ConnectionType.CUSTOM_AUTH,
          value: {
            type: ConnectionType.CUSTOM_AUTH,
            props: formUtils.getDefaultValueForProperties({
              props: auth.props ?? {},
              existingInput: {},
            }),
          },
        };
      }
      case PropertyType.OIDC: {
        return {
          ...commmonProps,
          type: ConnectionType.OIDC,
          value: {
            type: ConnectionType.OIDC,
            props: formUtils.getDefaultValueForProperties({
              props: auth.props ?? {},
              existingInput: {},
            }),
          },
        };
      }
      case PropertyType.OAUTH2: {
        switch (oauth2App?.oauth2Type) {
          case ConnectionType.CLOUD_OAUTH2:
            return {
              ...commmonProps,
              type: ConnectionType.CLOUD_OAUTH2,
              value: {
                type: ConnectionType.CLOUD_OAUTH2,
                client_id: oauth2App.clientId,
                code: '',
                scope: auth.scope.join(' '),
                authorization_method: auth.authorizationMethod,
                props: formUtils.getDefaultValueForProperties({
                  props: auth.props ?? {},
                  existingInput: {},
                }),
              },
            };
          case ConnectionType.TENANT_OAUTH2:
            return {
              ...commmonProps,
              type: ConnectionType.TENANT_OAUTH2,
              value: {
                type: ConnectionType.TENANT_OAUTH2,
                client_id: oauth2App.clientId,
                redirect_url: redirectUrl,
                code: '',
                scope: auth.scope.join(' '),
                authorization_method: auth.authorizationMethod,
                props: formUtils.getDefaultValueForProperties({
                  props: auth.props ?? {},
                  existingInput: {},
                }),
              },
            };
          default:
            return {
              ...commmonProps,
              type: ConnectionType.OAUTH2,
              value: {
                type: ConnectionType.OAUTH2,
                client_id: '',
                redirect_url: redirectUrl,
                code:
                  grantType === OAuth2GrantType.CLIENT_CREDENTIALS
                    ? 'FAKE_CODE'
                    : '',
                scope: auth.scope.join(' '),
                authorization_method: auth.authorizationMethod,
                props: formUtils.getDefaultValueForProperties({
                  props: auth.props ?? {},
                  existingInput: {},
                }),
                client_secret: '',
                grant_type: grantType ?? OAuth2GrantType.AUTHORIZATION_CODE,
              },
            };
        }
      }
    }
  },

  extractDefaultPropsValues(
    props: CustomAuthProps | OIDCAuthProps | OAuth2Props | undefined,
  ) {
    if (!props) {
      return {};
    }
    return Object.entries(props).reduce((acc, [propName, prop]) => {
      if (prop.defaultValue) {
        return {
          ...acc,
          [propName]: prop.defaultValue,
        };
      }
      if (prop.type === PropertyType.CHECKBOX) {
        return {
          ...acc,
          [propName]: false,
        };
      }
      return acc;
    }, {});
  },
};

export const isConnectionNameUnique = async ({
  isGlobalConnection,
  displayName,
  workspaceId,
}: {
  isGlobalConnection: boolean;
  displayName: string;
  workspaceId?: string;
}) => {
  const connections = isGlobalConnection
    ? await globalConnectionsApi.list({
        limit: 10000,
      })
    : await connectionsApi.list({
        workspaceId: workspaceId ?? authenticationSession.getWorkspaceId()!,
        limit: 10000,
      });
  const existingConnection = connections.data.find(
    (connection) => connection.displayName === displayName,
  );
  return isNil(existingConnection);
};

type DefaultValuesParams = {
  suggestedExternalId: string;
  suggestedDisplayName: string;
  connectorName: string;
  redirectUrl: string;
  auth: ConnectorAuthProperty;
  oauth2App: OAuth2App | null;
  grantType: OAuth2GrantType | null;
  workspaceId?: string;
};
