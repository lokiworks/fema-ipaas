import { generateId, isNil } from '@fema-ipaas/core-utils'
import { cryptoUtils } from '@fema-ipaas/server-utils'
import { TenantOwnerInput, UserIdentity, UserIdentityProvider } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { nanoid } from 'nanoid'
import { passwordHasher } from '../authentication/lib/password-hasher'
import { signupNames } from '../authentication/lib/signup-names'
import { userIdentityRepository } from '../authentication/user-identity/user-identity-service'

export const tenantOwnerService = (log: FastifyBaseLogger) => ({
    async ensureIdentity({ owner }: { owner: TenantOwnerInput }): Promise<OwnerIdentity> {
        const email = owner.email?.trim().toLowerCase()
        const phone = owner.phone?.trim()
        const byEmail = isNil(email) || !isNil(owner.subject) ? null : await userIdentityRepository().findOneBy({ email })
        const byPhone = isNil(phone) || !isNil(owner.subject) ? null : await userIdentityRepository().findOneBy({ phone })
        const existing = byEmail ?? byPhone
        if (!isNil(existing)) {
            return { identityId: existing.id, created: false }
        }
        const identity = await userIdentityRepository().save(await buildIdentity({ owner, email, phone }))
        log.info({ identity: { id: identity.id } }, '[tenantOwner] owner identity created')
        return { identityId: identity.id, created: true }
    },
})

async function buildIdentity({ owner, email, phone }: BuildIdentityParams): Promise<Partial<UserIdentity>> {
    const bySubject = !isNil(owner.subject)
    const now = dayjs().toISOString()
    return {
        id: generateId(),
        created: now,
        updated: now,
        firstName: owner.firstName ?? firstNameFor({ email, phone }),
        lastName: owner.lastName ?? '',
        email: bySubject ? null : email ?? null,
        phone: bySubject ? null : phone ?? null,
        contactEmail: bySubject ? email ?? null : null,
        phoneVerified: false,
        mfaEnabled: false,
        password: await passwordHasher.hash(await cryptoUtils.generateRandomPassword()),
        provider: providerFor({ bySubject, email }),
        verified: bySubject || isNil(email),
        trackEvents: true,
        newsLetter: false,
        tokenVersion: nanoid(),
    }
}

function providerFor({ bySubject, email }: { bySubject: boolean, email: string | undefined }): UserIdentityProvider {
    if (bySubject) {
        return UserIdentityProvider.OIDC
    }
    return isNil(email) ? UserIdentityProvider.PHONE : UserIdentityProvider.EMAIL
}

function firstNameFor({ email, phone }: { email: string | undefined, phone: string | undefined }): string {
    if (!isNil(email)) {
        return signupNames.firstNameFromEmail(email)
    }
    return isNil(phone) ? '' : phone.slice(-4)
}

type OwnerIdentity = {
    identityId: string
    created: boolean
}

type BuildIdentityParams = {
    owner: TenantOwnerInput
    email: string | undefined
    phone: string | undefined
}
