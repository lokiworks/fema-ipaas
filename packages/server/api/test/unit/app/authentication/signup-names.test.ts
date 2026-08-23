import { signupNames } from '../../../../src/app/authentication/lib/signup-names'

describe('signupNames', () => {
    describe('firstNameFromEmail', () => {
        it.each([
            ['ahmad@fema.local', 'Ahmad'],
            ['ahmad.tash@fema.local', 'Ahmad'],
            ['ahmad_tash@fema.local', 'Ahmad'],
            ['ahmad+work@fema.local', 'Ahmad'],
            ['AHMAD@fema.local', 'AHMAD'],
        ])('derives %s into %s', (email, expected) => {
            expect(signupNames.firstNameFromEmail(email)).toBe(expected)
        })

        it('falls back when the local part carries no letters or digits', () => {
            expect(signupNames.firstNameFromEmail('...@fema.local')).toBe('there')
        })
    })

    describe('splitFullName', () => {
        it.each([
            ['Ahmad Tash', 'Ahmad', 'Tash'],
            ['Ahmad', 'Ahmad', ''],
            ['  Ahmad   Tash  ', 'Ahmad', 'Tash'],
            ['Ahmad Bin Tash', 'Ahmad', 'Bin Tash'],
            ['ahmad tash', 'ahmad', 'tash'],
        ])('splits %s into %s / %s', (fullName, firstName, lastName) => {
            expect(
                signupNames.splitFullName({ fullName, email: 'someone@fema.local' }),
            ).toEqual({ firstName, lastName })
        })

        it('strips the characters the tenant name rule rejects', () => {
            expect(
                signupNames.splitFullName({ fullName: 'J. Smith', email: 'j@fema.local' }),
            ).toEqual({ firstName: 'J', lastName: 'Smith' })
        })

        it('falls back to the email when the name carries nothing usable', () => {
            expect(
                signupNames.splitFullName({ fullName: '   ', email: 'ahmad@fema.local' }),
            ).toEqual({ firstName: 'Ahmad', lastName: '' })
        })
    })

    describe('tenantNameFromPerson', () => {
        it.each([
            ['Ahmad', "Ahmad's Tenant"],
            ['Ahmad Bin', "Ahmad's Tenant"],
            ['Chris', "Chris's Tenant"],
            ["Ahmad's", "Ahmad's Tenant"],
        ])('names the tenant from %s -> %s', (firstName, expected) => {
            expect(
                signupNames.tenantNameFromPerson({ firstName, email: 'a.b@fema.local' }),
            ).toBe(expected)
        })

        it('falls back to the email local part when the person has no usable name', () => {
            expect(
                signupNames.tenantNameFromPerson({ firstName: '', email: 'ahmad.tash@fema.local' }),
            ).toBe("Ahmad's Tenant")
        })

        it('uses the whole fallback when neither the name nor the address yields a word', () => {
            expect(
                signupNames.tenantNameFromPerson({ firstName: '', email: '___@fema.local' }),
            ).toBe('My Tenant')
        })

        it('stays inside the tenant name limit when the address is one long word', () => {
            const name = signupNames.tenantNameFromPerson({
                firstName: '',
                email: `${'a'.repeat(120)}@fema.local`,
            })

            expect(name.length).toBeLessThanOrEqual(100)
        })

        it('never produces a name the tenant name rule rejects', () => {
            const safeString = new RegExp('^[^./]+$')
            const name = signupNames.tenantNameFromPerson({
                firstName: 'J./Smith',
                email: 'j@fema.local',
            })

            expect(name).toMatch(safeString)
            expect(name.length).toBeLessThanOrEqual(100)
        })
    })

})
