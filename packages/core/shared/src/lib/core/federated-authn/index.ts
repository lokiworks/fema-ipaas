import { Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { ThirdPartyAuthnProviderEnum } from './authn-provider-name'
import { StoredFeishuSso, StoredOidcSso } from './sso-config'

export * from './authn-provider-name'
export * from './sso-config'

export const federatedAuthnLoginResponse = z.object({
    loginUrl: z.string(),
})
export type FederatedAuthnLoginResponse = z.infer<typeof federatedAuthnLoginResponse>


export const ClaimTokenRequest = z.object({
    providerName: z.nativeEnum(ThirdPartyAuthnProviderEnum),
    code: z.string(),
})

export type ClaimTokenRequest = z.infer<typeof ClaimTokenRequest>

export const SAMLAttributeMapping = z.object({
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
})
export type SAMLAttributeMapping = z.infer<typeof SAMLAttributeMapping>

export const SAMLAuthnProviderConfig = z.object({
    idpMetadata: z.string(),
    idpCertificate: z.string(),
    attributeMapping: SAMLAttributeMapping.optional(),
})
export type SAMLAuthnProviderConfig = z.infer<typeof SAMLAuthnProviderConfig>

export const FederatedAuthnProviderConfig = z.object({
    saml: Nullable(SAMLAuthnProviderConfig),
    oidc: Nullable(StoredOidcSso),
    feishu: Nullable(StoredFeishuSso),
})
export type FederatedAuthnProviderConfig = z.infer<typeof FederatedAuthnProviderConfig>

export const FederatedAuthnProviderUpdate = z.object({
    saml: Nullable(SAMLAuthnProviderConfig),
})
export type FederatedAuthnProviderUpdate = z.infer<typeof FederatedAuthnProviderUpdate>

export const FederatedAuthnProviderConfigWithoutSensitiveData = z.object({
    saml: Nullable(z.object({})),
})

export type FederatedAuthnProviderConfigWithoutSensitiveData = z.infer<typeof FederatedAuthnProviderConfigWithoutSensitiveData>
