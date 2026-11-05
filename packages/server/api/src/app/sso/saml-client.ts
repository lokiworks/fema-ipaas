import { X509Certificate } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { SsoLoginErrorCode, StoredSamlSso } from '@fema-ipaas/shared'
import { InMemoryCacheProvider, Profile, SAML, ValidateInResponseTo } from '@node-saml/node-saml'
import { XMLParser } from 'fast-xml-parser'
import { SsoLoginError } from './sso-errors'

function parseIdpMetadata({ xml }: { xml: string }): IdpMetadata {
    const document = parseXml({ xml })
    const descriptor = findIdpDescriptor({ document })
    if (isNil(descriptor)) {
        throw invalid('The metadata contains no identity provider descriptor')
    }
    const entityId = stringAttribute({ node: descriptor.entity, name: 'entityID' })
    if (isNil(entityId)) {
        throw invalid('The metadata has no entityID')
    }
    const ssoUrl = pickRedirectLocation({ idp: descriptor.idp })
    if (isNil(ssoUrl)) {
        throw invalid('The metadata offers no HTTP-Redirect single sign-on endpoint')
    }
    const certificates = signingCertificates({ idp: descriptor.idp })
    if (certificates.length === 0) {
        throw invalid('The metadata contains no signing certificate')
    }
    return { entityId, ssoUrl, certificates }
}

function serviceProviderUrls({ apiBase, tenantId }: ServiceProviderUrlsParams): ServiceProviderUrls {
    const base = apiBase.replace(/\/+$/, '')
    const metadataUrl = `${base}/v1/authn/sso/saml/metadata/${tenantId}`
    return { entityId: metadataUrl, metadataUrl, acsUrl: `${base}/v1/authn/sso/saml/acs` }
}

async function buildAuthorizationUrl({ stored, sp, relayState, requestId }: BuildAuthorizationUrlParams): Promise<string> {
    const saml = createSaml({ stored, sp, requestId })
    return saml.getAuthorizeUrlAsync(relayState, {})
}

async function validateResponse({ stored, sp, samlResponse, expectedRequestId }: ValidateResponseParams): Promise<SamlAssertion> {
    const cache = new InMemoryCacheProvider()
    await cache.saveAsync(expectedRequestId, new Date().toISOString())
    const saml = createSaml({ stored, sp, requestId: expectedRequestId, cache })
    let result: Awaited<ReturnType<SAML['validatePostResponseAsync']>>
    try {
        result = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse })
    }
    catch (error) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: `The SAML response was rejected: ${error instanceof Error ? error.message : 'invalid response'}` })
    }
    const profile = result.profile
    if (isNil(profile) || result.loggedOut) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'The SAML response carries no assertion' })
    }
    return { nameId: profile.nameID, attributes: collectAttributes({ profile }) }
}

function buildServiceProviderMetadata({ stored, sp }: { stored: StoredSamlSso, sp: ServiceProviderUrls }): string {
    return createSaml({ stored, sp, requestId: 'metadata' }).generateServiceProviderMetadata(null, null)
}

function toProfile({ stored, assertion }: ToProfileParams): SamlProfile {
    const subject = stored.subjectSource === 'ATTRIBUTE' && !isNil(stored.subjectAttribute) && stored.subjectAttribute.length > 0
        ? firstValue({ values: assertion.attributes[stored.subjectAttribute] })
        : assertion.nameId
    if (isNil(subject) || subject.length === 0) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'The SAML assertion carries no subject' })
    }
    const attributeEmail = firstValue({ values: assertion.attributes[stored.emailAttribute] })
    const email = (attributeEmail ?? (assertion.nameId.includes('@') ? assertion.nameId : '')).trim().toLowerCase()
    return {
        subject,
        email,
        givenName: isNil(stored.firstNameAttribute) || stored.firstNameAttribute.length === 0 ? '' : firstValue({ values: assertion.attributes[stored.firstNameAttribute] }) ?? '',
        familyName: isNil(stored.lastNameAttribute) || stored.lastNameAttribute.length === 0 ? '' : firstValue({ values: assertion.attributes[stored.lastNameAttribute] }) ?? '',
    }
}

function createSaml({ stored, sp, requestId, cache }: CreateSamlParams): SAML {
    return new SAML({
        callbackUrl: sp.acsUrl,
        entryPoint: stored.idpSsoUrl,
        issuer: sp.entityId,
        audience: sp.entityId,
        idpIssuer: stored.idpEntityId,
        idpCert: stored.idpCertificates.map(toPem),
        wantAssertionsSigned: false,
        wantAuthnResponseSigned: false,
        validateInResponseTo: ValidateInResponseTo.always,
        cacheProvider: cache ?? new InMemoryCacheProvider(),
        disableRequestedAuthnContext: true,
        acceptedClockSkewMs: CLOCK_SKEW_MS,
        generateUniqueId: () => requestId,
    })
}

function parseXml({ xml }: { xml: string }): unknown {
    try {
        return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, processEntities: false }).parse(xml)
    }
    catch {
        throw invalid('The metadata is not well-formed XML')
    }
}

function findIdpDescriptor({ document }: { document: unknown }): { entity: unknown, idp: unknown } | null {
    if (!isRecord(document)) {
        return null
    }
    const candidates = [...asArray(document['EntityDescriptor']), ...asArray(isRecord(document['EntitiesDescriptor']) ? document['EntitiesDescriptor']['EntityDescriptor'] : undefined)]
    const match = candidates.find((entity) => isRecord(entity) && !isNil(entity['IDPSSODescriptor']))
    if (!isRecord(match)) {
        return null
    }
    return { entity: match, idp: asArray(match['IDPSSODescriptor'])[0] }
}

function pickRedirectLocation({ idp }: { idp: unknown }): string | null {
    if (!isRecord(idp)) {
        return null
    }
    const services = asArray(idp['SingleSignOnService'])
    const redirect = services.find((service) => isRecord(service) && service['@_Binding'] === REDIRECT_BINDING)
    return isRecord(redirect) && typeof redirect['@_Location'] === 'string' ? redirect['@_Location'] : null
}

function signingCertificates({ idp }: { idp: unknown }): string[] {
    if (!isRecord(idp)) {
        return []
    }
    const keys = asArray(idp['KeyDescriptor']).filter((key) => isRecord(key) && (isNil(key['@_use']) || key['@_use'] === 'signing'))
    const certificates = keys.flatMap((key) => {
        const info = isRecord(key) ? key['KeyInfo'] : undefined
        const data = isRecord(info) ? info['X509Data'] : undefined
        return asArray(data).flatMap((entry) => isRecord(entry) ? asArray(entry['X509Certificate']) : [])
    })
    const normalized = certificates.filter((certificate): certificate is string => typeof certificate === 'string').map((certificate) => certificate.replace(/\s+/g, ''))
    normalized.forEach((certificate) => assertCertificate({ certificate }))
    return [...new Set(normalized)]
}

function assertCertificate({ certificate }: { certificate: string }): void {
    try {
        new X509Certificate(Buffer.from(certificate, 'base64'))
    }
    catch {
        throw invalid('The metadata contains a certificate that cannot be read')
    }
}

function collectAttributes({ profile }: { profile: Profile }): Record<string, string[]> {
    const entries = Object.entries(profile)
        .filter(([name]) => !RESERVED_PROFILE_KEYS.includes(name))
        .map(([name, value]): [string, string[]] => [name, asArray(value).filter((item): item is string => typeof item === 'string')])
        .filter(([, values]) => values.length > 0)
    return Object.fromEntries(entries)
}

function firstValue({ values }: { values: string[] | undefined }): string | null {
    const first = values?.find((value) => value.trim().length > 0)
    return isNil(first) ? null : first.trim()
}

function toPem(certificate: string): string {
    const lines = certificate.match(/.{1,64}/g) ?? []
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`
}

function stringAttribute({ node, name }: { node: unknown, name: string }): string | null {
    if (!isRecord(node)) {
        return null
    }
    const value = node[`@_${name}`]
    return typeof value === 'string' && value.length > 0 ? value : null
}

function asArray(value: unknown): unknown[] {
    if (isNil(value)) {
        return []
    }
    return Array.isArray(value) ? value : [value]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(detail: string): SsoLoginError {
    return new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail })
}

const REDIRECT_BINDING = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
const CLOCK_SKEW_MS = 60_000
const RESERVED_PROFILE_KEYS = ['issuer', 'sessionIndex', 'nameID', 'nameIDFormat', 'nameQualifier', 'spNameQualifier', 'ID']

export const samlClient = {
    parseIdpMetadata,
    serviceProviderUrls,
    buildAuthorizationUrl,
    validateResponse,
    buildServiceProviderMetadata,
    toProfile,
}

export type IdpMetadata = {
    entityId: string
    ssoUrl: string
    certificates: string[]
}

export type ServiceProviderUrls = {
    entityId: string
    metadataUrl: string
    acsUrl: string
}

export type SamlAssertion = {
    nameId: string
    attributes: Record<string, string[]>
}

export type SamlProfile = {
    subject: string
    email: string
    givenName: string
    familyName: string
}

type ServiceProviderUrlsParams = {
    apiBase: string
    tenantId: string
}

type CreateSamlParams = {
    stored: StoredSamlSso
    sp: ServiceProviderUrls
    requestId: string
    cache?: InMemoryCacheProvider
}

type BuildAuthorizationUrlParams = {
    stored: StoredSamlSso
    sp: ServiceProviderUrls
    relayState: string
    requestId: string
}

type ValidateResponseParams = {
    stored: StoredSamlSso
    sp: ServiceProviderUrls
    samlResponse: string
    expectedRequestId: string
}

type ToProfileParams = {
    stored: StoredSamlSso
    assertion: SamlAssertion
}
