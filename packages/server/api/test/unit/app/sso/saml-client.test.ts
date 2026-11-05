import { StoredSamlSso, TenantRole } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { SignedXml } from 'xml-crypto'
import { samlClient, ServiceProviderUrls } from '../../../../src/app/sso/saml-client'
import { samlTestCredentials } from './saml-test-credentials'

const idpEntityId = 'https://idp.acme.test/entity'
const sp: ServiceProviderUrls = samlClient.serviceProviderUrls({ apiBase: 'https://ipaas.test/api/', tenantId: 'tenant-1' })
const requestId = '_request-1'

function certificateBody(pem: string): string {
    return pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '')
}

function storedConfig(overrides: Partial<StoredSamlSso> = {}): StoredSamlSso {
    return {
        enabled: true,
        displayName: 'Acme SSO',
        allowedDomains: [],
        autoCreateUsers: false,
        defaultRole: TenantRole.MEMBER,
        roleMapping: null,
        defaultProject: null,
        verifiedAt: null,
        lastLoginAt: null,
        idpMetadataXml: '',
        idpEntityId,
        idpSsoUrl: 'https://idp.acme.test/sso',
        idpCertificates: [certificateBody(samlTestCredentials.idp.certificate)],
        emailAttribute: 'mail',
        firstNameAttribute: 'givenName',
        lastNameAttribute: 'sn',
        subjectSource: 'NAME_ID',
        subjectAttribute: null,
        signAuthnRequests: false,
        ...overrides,
    }
}

function responseXml(overrides: Partial<{ audience: string, inResponseTo: string, notOnOrAfter: string, mail: string }> = {}): string {
    const now = dayjs()
    const audience = overrides.audience ?? sp.entityId
    const inResponseTo = overrides.inResponseTo ?? requestId
    const notOnOrAfter = overrides.notOnOrAfter ?? now.add(5, 'minute').toISOString()
    return `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_response-1" Version="2.0" IssueInstant="${now.toISOString()}" Destination="${sp.acsUrl}" InResponseTo="${inResponseTo}"><saml:Issuer>${idpEntityId}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion ID="_assertion-1" Version="2.0" IssueInstant="${now.toISOString()}"><saml:Issuer>${idpEntityId}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">name-id-1</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${sp.acsUrl}" InResponseTo="${inResponseTo}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${now.subtract(1, 'minute').toISOString()}" NotOnOrAfter="${notOnOrAfter}"><saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${now.toISOString()}" SessionIndex="_session-1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="mail"><saml:AttributeValue>${overrides.mail ?? 'Alice@Acme.test'}</saml:AttributeValue></saml:Attribute><saml:Attribute Name="givenName"><saml:AttributeValue>Alice</saml:AttributeValue></saml:Attribute><saml:Attribute Name="sn"><saml:AttributeValue>Liddell</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion></samlp:Response>`
}

function sign({ xml, target, credentials = samlTestCredentials.idp }: { xml: string, target: 'assertion' | 'response', credentials?: { privateKey: string, certificate: string } }): string {
    const signer = new SignedXml({
        privateKey: credentials.privateKey,
        publicCert: credentials.certificate,
        signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
        canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    })
    const xpath = target === 'assertion' ? '//*[local-name(.)=\'Assertion\']' : '/*[local-name(.)=\'Response\']'
    signer.addReference({
        xpath,
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
        transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
    })
    const issuerPath = target === 'assertion' ? '//*[local-name(.)=\'Assertion\']/*[local-name(.)=\'Issuer\']' : '/*[local-name(.)=\'Response\']/*[local-name(.)=\'Issuer\']'
    signer.computeSignature(xml, { location: { reference: issuerPath, action: 'after' } })
    return signer.getSignedXml()
}

function encode(xml: string): string {
    return Buffer.from(xml, 'utf8').toString('base64')
}

async function validate({ xml, config = storedConfig(), expectedRequestId = requestId }: { xml: string, config?: StoredSamlSso, expectedRequestId?: string }) {
    return samlClient.validateResponse({ stored: config, sp, samlResponse: encode(xml), expectedRequestId })
}

const metadataXml = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="${idpEntityId}">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${samlTestCredentials.idp.certificate.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\n/g, '\n      ')}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:KeyDescriptor use="encryption"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certificateBody(samlTestCredentials.other.certificate)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.acme.test/sso-post"/>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.acme.test/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`

describe('saml client', () => {
    describe('service provider addresses', () => {
        it('derives the entity id, metadata and ACS addresses from the public API address', () => {
            expect(sp).toEqual({
                entityId: 'https://ipaas.test/api/v1/authn/sso/saml/metadata/tenant-1',
                metadataUrl: 'https://ipaas.test/api/v1/authn/sso/saml/metadata/tenant-1',
                acsUrl: 'https://ipaas.test/api/v1/authn/sso/saml/acs',
            })
        })

        it('publishes metadata that names the ACS address and the entity id', () => {
            const xml = samlClient.buildServiceProviderMetadata({ stored: storedConfig(), sp })
            expect(xml).toContain(sp.entityId)
            expect(xml).toContain(sp.acsUrl)
            expect(xml).toContain('urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST')
        })
    })

    describe('reading the identity provider metadata', () => {
        it('takes the entity id, the redirect endpoint and the signing certificates only', () => {
            const parsed = samlClient.parseIdpMetadata({ xml: metadataXml })
            expect(parsed.entityId).toBe(idpEntityId)
            expect(parsed.ssoUrl).toBe('https://idp.acme.test/sso')
            expect(parsed.certificates).toEqual([certificateBody(samlTestCredentials.idp.certificate)])
        })

        it('rejects metadata that is not XML, has no IdP descriptor, no redirect endpoint or no certificate', () => {
            expect(() => samlClient.parseIdpMetadata({ xml: 'nope' })).toThrow()
            expect(() => samlClient.parseIdpMetadata({ xml: '<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="x"/>' })).toThrow()
            expect(() => samlClient.parseIdpMetadata({ xml: metadataXml.replace('HTTP-Redirect', 'HTTP-Other') })).toThrow()
            expect(() => samlClient.parseIdpMetadata({ xml: metadataXml.replace(/use="signing"/, 'use="encryption"') })).toThrow()
        })

        it('rejects a certificate that cannot be read', () => {
            const broken = metadataXml.replace(certificateBody(samlTestCredentials.idp.certificate).slice(0, 40), 'AAAA')
            expect(() => samlClient.parseIdpMetadata({ xml: broken })).toThrow()
        })
    })

    describe('starting a sign-in', () => {
        it('redirects to the identity provider with the request id and the relay state', async () => {
            const url = new URL(await samlClient.buildAuthorizationUrl({ stored: storedConfig(), sp, relayState: 'state-1', requestId }))
            expect(url.origin + url.pathname).toBe('https://idp.acme.test/sso')
            expect(url.searchParams.get('RelayState')).toBe('state-1')
            expect(url.searchParams.get('SAMLRequest')).toBeTruthy()
        })
    })

    describe('validating a response', () => {
        it('accepts a response whose assertion is signed', async () => {
            const assertion = await validate({ xml: sign({ xml: responseXml(), target: 'assertion' }) })
            expect(assertion.nameId).toBe('name-id-1')
            expect(assertion.attributes['mail']).toEqual(['Alice@Acme.test'])
        })

        it('accepts a response that is signed as a whole', async () => {
            const assertion = await validate({ xml: sign({ xml: responseXml(), target: 'response' }) })
            expect(assertion.nameId).toBe('name-id-1')
        })

        it('rejects a response nobody signed', async () => {
            await expect(validate({ xml: responseXml() })).rejects.toMatchObject({ code: 'TOKEN_INVALID' })
        })

        it('rejects a response signed with another key', async () => {
            const forged = sign({ xml: responseXml(), target: 'assertion', credentials: samlTestCredentials.other })
            await expect(validate({ xml: forged })).rejects.toMatchObject({ code: 'TOKEN_INVALID' })
        })

        it('rejects an assertion changed after signing', async () => {
            const signed = sign({ xml: responseXml(), target: 'assertion' })
            await expect(validate({ xml: signed.replace('Alice@Acme.test', 'admin@acme.test') })).rejects.toMatchObject({ code: 'TOKEN_INVALID' })
        })

        it('rejects a response meant for another request', async () => {
            const signed = sign({ xml: responseXml({ inResponseTo: '_someone-elses' }), target: 'assertion' })
            await expect(validate({ xml: signed })).rejects.toMatchObject({ code: 'TOKEN_INVALID' })
        })

        it('rejects a response addressed to another service provider', async () => {
            const signed = sign({ xml: responseXml({ audience: 'https://another-sp.test' }), target: 'assertion' })
            await expect(validate({ xml: signed })).rejects.toMatchObject({ code: 'TOKEN_INVALID' })
        })

        it('rejects an expired response', async () => {
            const signed = sign({ xml: responseXml({ notOnOrAfter: dayjs().subtract(10, 'minute').toISOString() }), target: 'assertion' })
            await expect(validate({ xml: signed })).rejects.toMatchObject({ code: 'TOKEN_INVALID' })
        })

        it('rejects a response from another identity provider', async () => {
            const signed = sign({ xml: responseXml(), target: 'assertion' })
            await expect(validate({ xml: signed, config: storedConfig({ idpEntityId: 'https://impostor.test' }) })).rejects.toMatchObject({ code: 'TOKEN_INVALID' })
        })

        it('accepts a rotated certificate when both are configured', async () => {
            const config = storedConfig({ idpCertificates: [certificateBody(samlTestCredentials.other.certificate), certificateBody(samlTestCredentials.idp.certificate)] })
            const assertion = await validate({ xml: sign({ xml: responseXml(), target: 'assertion' }), config })
            expect(assertion.nameId).toBe('name-id-1')
        })
    })

    describe('turning an assertion into a profile', () => {
        const assertion = { nameId: 'name-id-1', attributes: { mail: ['Alice@Acme.test'], givenName: ['Alice'], sn: ['Liddell'], employeeNumber: ['E-42'] } }

        it('uses the NameID as the subject and the mail attribute as the email', () => {
            expect(samlClient.toProfile({ stored: storedConfig(), assertion })).toEqual({ subject: 'name-id-1', email: 'alice@acme.test', givenName: 'Alice', familyName: 'Liddell' })
        })

        it('can take the subject from an attribute instead', () => {
            const profile = samlClient.toProfile({ stored: storedConfig({ subjectSource: 'ATTRIBUTE', subjectAttribute: 'employeeNumber' }), assertion })
            expect(profile.subject).toBe('E-42')
        })

        it('rejects an assertion without the configured subject attribute', () => {
            expect(() => samlClient.toProfile({ stored: storedConfig({ subjectSource: 'ATTRIBUTE', subjectAttribute: 'missing' }), assertion })).toThrow()
        })

        it('falls back to an email shaped NameID when the mail attribute is absent', () => {
            const profile = samlClient.toProfile({ stored: storedConfig(), assertion: { nameId: 'Bob@Acme.test', attributes: {} } })
            expect(profile.email).toBe('bob@acme.test')
        })

        it('leaves the email empty when there is nothing that looks like one', () => {
            const profile = samlClient.toProfile({ stored: storedConfig(), assertion: { nameId: 'opaque-id', attributes: {} } })
            expect(profile.email).toBe('')
        })
    })
})
