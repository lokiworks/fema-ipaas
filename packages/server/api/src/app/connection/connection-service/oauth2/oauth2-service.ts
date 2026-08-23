import { OAuth2AuthorizationMethod } from '@fema-ipaas/connector-sdk'
import {
    BaseOAuth2ConnectionValue,
    OAuth2GrantType,
} from '@fema-ipaas/shared'

export type OAuth2Service<CONNECTION_VALUE extends BaseOAuth2ConnectionValue> =
  {
      claim(request: ClaimOAuth2Request): Promise<CONNECTION_VALUE>
      refresh(
          request: RefreshOAuth2Request<CONNECTION_VALUE>
      ): Promise<CONNECTION_VALUE>
  }

export type RefreshOAuth2Request<T extends BaseOAuth2ConnectionValue> = {
    connectorName: string
    workspaceId: string | undefined
    tenantId: string
    connectionValue: T
}

export type OAuth2RequestBody = {
    props?: Record<string, unknown>
    code: string
    clientId: string
    tokenUrl: string
    clientSecret?: string
    redirectUrl?: string
    grantType?: OAuth2GrantType
    authorizationMethod?: OAuth2AuthorizationMethod
    codeVerifier?: string
    scope?: string
}

export type ClaimOAuth2Request = {
    workspaceId: string | undefined
    tenantId: string
    connectorName: string
    request: OAuth2RequestBody
}
