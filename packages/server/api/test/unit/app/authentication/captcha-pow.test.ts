import { describe, expect, it } from 'vitest'
import { captchaPow } from '../../../../src/app/authentication/captcha/captcha-pow'

const KEY = captchaPow.deriveKey({ secret: 'captcha-test-secret' })
const MAX_NUMBER = 2000
const NOW = 1_800_000_000

function issue() {
    return captchaPow.createChallenge({ key: KEY, nowSeconds: NOW, ttlSeconds: 300, maxNumber: MAX_NUMBER })
}

describe('captchaPow', () => {
    it('hands out a challenge the client can solve by brute force', () => {
        const challenge = issue()
        const solution = captchaPow.solve({ challenge })
        expect(solution).not.toBeNull()
        expect(solution?.number).toBeLessThanOrEqual(MAX_NUMBER)
        expect(challenge.algorithm).toBe('SHA-256')
    })

    it('accepts a solved challenge and reports its expiry', () => {
        const solution = captchaPow.solve({ challenge: issue() })
        if (solution === null) {
            throw new Error('challenge was not solvable')
        }
        const verdict = captchaPow.verifySolution({ key: KEY, solution, nowSeconds: NOW + 10, maxNumber: MAX_NUMBER })
        expect(verdict).toEqual({ ok: true, challenge: solution.challenge, expiresAt: NOW + 300 })
    })

    it('survives the base64url token round trip', () => {
        const solution = captchaPow.solve({ challenge: issue() })
        if (solution === null) {
            throw new Error('challenge was not solvable')
        }
        const token = captchaPow.encodeSolution({ solution })
        expect(captchaPow.decodeSolution({ token })).toEqual(solution)
    })

    it('rejects tokens that are not a solution', () => {
        expect(captchaPow.decodeSolution({ token: 'not-a-token' })).toBeNull()
        expect(captchaPow.decodeSolution({ token: Buffer.from('{"a":1}').toString('base64url') })).toBeNull()
    })

    it('refuses a wrong number', () => {
        const solution = captchaPow.solve({ challenge: issue() })
        if (solution === null) {
            throw new Error('challenge was not solvable')
        }
        const verdict = captchaPow.verifySolution({ key: KEY, solution: { ...solution, number: solution.number + 1 }, nowSeconds: NOW, maxNumber: MAX_NUMBER })
        expect(verdict).toEqual({ ok: false, reason: 'work' })
    })

    it('refuses a challenge signed with another key, so clients cannot mint their own', () => {
        const forged = captchaPow.createChallenge({ key: captchaPow.deriveKey({ secret: 'other' }), nowSeconds: NOW, ttlSeconds: 300, maxNumber: MAX_NUMBER })
        const solution = captchaPow.solve({ challenge: forged })
        if (solution === null) {
            throw new Error('challenge was not solvable')
        }
        expect(captchaPow.verifySolution({ key: KEY, solution, nowSeconds: NOW, maxNumber: MAX_NUMBER })).toEqual({ ok: false, reason: 'signature' })
    })

    it('refuses to extend the expiry carried in the salt', () => {
        const solution = captchaPow.solve({ challenge: issue() })
        if (solution === null) {
            throw new Error('challenge was not solvable')
        }
        const extended = { ...solution, salt: solution.salt.replace(/expires=\d+/u, `expires=${NOW + 999999}`) }
        expect(captchaPow.verifySolution({ key: KEY, solution: extended, nowSeconds: NOW, maxNumber: MAX_NUMBER })).toEqual({ ok: false, reason: 'signature' })
    })

    it('refuses an expired challenge', () => {
        const solution = captchaPow.solve({ challenge: issue() })
        if (solution === null) {
            throw new Error('challenge was not solvable')
        }
        expect(captchaPow.verifySolution({ key: KEY, solution, nowSeconds: NOW + 301, maxNumber: MAX_NUMBER })).toEqual({ ok: false, reason: 'expired' })
    })

    it('refuses a salt without an expiry', () => {
        const solution = captchaPow.solve({ challenge: issue() })
        if (solution === null) {
            throw new Error('challenge was not solvable')
        }
        expect(captchaPow.verifySolution({ key: KEY, solution: { ...solution, salt: 'plain' }, nowSeconds: NOW, maxNumber: MAX_NUMBER })).toEqual({ ok: false, reason: 'malformed' })
    })

    it('refuses numbers outside the allowed range', () => {
        const solution = captchaPow.solve({ challenge: issue() })
        if (solution === null) {
            throw new Error('challenge was not solvable')
        }
        expect(captchaPow.verifySolution({ key: KEY, solution: { ...solution, number: -1 }, nowSeconds: NOW, maxNumber: MAX_NUMBER })).toEqual({ ok: false, reason: 'number' })
        expect(captchaPow.verifySolution({ key: KEY, solution: { ...solution, number: MAX_NUMBER + 1 }, nowSeconds: NOW, maxNumber: MAX_NUMBER })).toEqual({ ok: false, reason: 'number' })
    })
})
