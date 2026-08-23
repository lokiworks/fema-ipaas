
import * as z from "zod/mini";
import { BasicAuthProperty } from "./basic-auth-prop";
import { CustomAuthProperty, CustomAuthProps } from "./custom-auth-prop";
import { OIDCProperty, OIDCAuthProps } from "./oidc-prop";
import { SecretTextProperty } from "./secret-text-property";
import { PropertyType } from "../input/property-type";
import { OAuth2Property, OAuth2Props } from "./oauth2-prop";
import { isNil } from "@fema/core-utils";
import { ConnectionType } from "@fema/connector-types";

export const ConnectorAuthProperty = z.union([
  BasicAuthProperty,
  CustomAuthProperty,
  OIDCProperty,
  OAuth2Property,
  SecretTextProperty,
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConnectorAuthProperty = BasicAuthProperty | CustomAuthProperty<any> | OIDCProperty<any> | OAuth2Property<any> | SecretTextProperty<boolean>;

type AuthProperties<T> = Omit<Properties<T>, 'displayName'> & {
  displayName?: string;
};

type Properties<T> = Omit<
  T,
  'valueSchema' | 'type' | 'defaultValidators' | 'defaultProcessors'
>;

export const DEFAULT_CONNECTION_DISPLAY_NAME = 'Connection';
export const ConnectorAuth = {
  SecretText<R extends boolean>(
    request: Properties<SecretTextProperty<R>>
  ): R extends true ? SecretTextProperty<true> : SecretTextProperty<false> {
    return {
      ...request,
      valueSchema: undefined,
      type: PropertyType.SECRET_TEXT,
    } as unknown as R extends true ? SecretTextProperty<true> : SecretTextProperty<false>;
  },
  OAuth2<T extends OAuth2Props>(
    request: AuthProperties<OAuth2Property<T>>
  ): OAuth2Property<T> {
    return {
      ...request,
      valueSchema: undefined,
      type: PropertyType.OAUTH2,
      displayName: request.displayName || DEFAULT_CONNECTION_DISPLAY_NAME,
    } as unknown as OAuth2Property<T>
  },
  BasicAuth(
    request: AuthProperties<BasicAuthProperty>
  ): BasicAuthProperty {
    return {
      ...request,
      valueSchema: undefined,
      type: PropertyType.BASIC_AUTH,
      displayName: request.displayName || DEFAULT_CONNECTION_DISPLAY_NAME,
      required: true,
    } as unknown as BasicAuthProperty;
  },
  CustomAuth<T extends CustomAuthProps>(
    request: AuthProperties<CustomAuthProperty<T>>
  ): CustomAuthProperty<T> {
    return {
      ...request,
      valueSchema: undefined,
      type: PropertyType.CUSTOM_AUTH,
      displayName: request.displayName || DEFAULT_CONNECTION_DISPLAY_NAME,
    } as unknown as CustomAuthProperty<T>
  },
  OIDC<T extends OIDCAuthProps>(
    request: AuthProperties<OIDCProperty<T>>
  ): OIDCProperty<T> {
    return {
      ...request,
      valueSchema: undefined,
      type: PropertyType.OIDC,
      displayName: request.displayName || DEFAULT_CONNECTION_DISPLAY_NAME,
    } as unknown as OIDCProperty<T>
  },
  None() {
    return undefined;
  },
};

export type ExtractConnectorAuthPropertyTypeForMethods<T extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined> = T extends ConnectorAuthProperty[] ? T[number] : T extends undefined ? undefined : T;

export function getAuthPropertyForValue({ authValueType, connectorAuth }: GetAuthPropertyForValue) {
  if (!Array.isArray(connectorAuth) || isNil(connectorAuth)) {
    return connectorAuth;
  }

  return connectorAuth.find(auth => authConnectionTypeToPropertyType[authValueType] === auth.type) ?? connectorAuth.at(0);
}

type GetAuthPropertyForValue = {
  authValueType: ConnectionType
  connectorAuth: ConnectorAuthProperty | ConnectorAuthProperty[] | undefined
}

const authConnectionTypeToPropertyType: Record<ConnectionType, PropertyType | undefined> = {
  [ConnectionType.OAUTH2]: PropertyType.OAUTH2,
  [ConnectionType.CLOUD_OAUTH2]: PropertyType.OAUTH2,
  [ConnectionType.TENANT_OAUTH2]: PropertyType.OAUTH2,
  [ConnectionType.BASIC_AUTH]: PropertyType.BASIC_AUTH,
  [ConnectionType.CUSTOM_AUTH]: PropertyType.CUSTOM_AUTH,
  [ConnectionType.OIDC]: PropertyType.OIDC,
  [ConnectionType.SECRET_TEXT]: PropertyType.SECRET_TEXT,
  [ConnectionType.NO_AUTH]: undefined,
}
