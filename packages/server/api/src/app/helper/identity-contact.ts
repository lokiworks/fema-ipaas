import { isNil } from '@fema-ipaas/core-utils'

export const identityContact = {
    of(identity: ContactSource): string {
        return identity.email ?? identity.contactEmail ?? identity.phone ?? ''
    },
    fullName(identity: NamedContactSource): string {
        const name = `${identity.firstName} ${identity.lastName}`.trim()
        return name.length > 0 ? name : identityContact.of(identity)
    },
    emailOrNull(identity: ContactSource | null | undefined): string | null {
        if (isNil(identity)) {
            return null
        }
        const email = identity.email ?? identity.contactEmail
        return isNil(email) || email.length === 0 ? null : email
    },
}

type ContactSource = {
    email?: string | null
    contactEmail?: string | null
    phone?: string | null
}

type NamedContactSource = ContactSource & {
    firstName: string
    lastName: string
}
