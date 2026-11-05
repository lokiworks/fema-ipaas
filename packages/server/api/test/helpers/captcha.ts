import { CaptchaChallenge } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { captchaPow } from '../../src/app/authentication/captcha/captcha-pow'

let requests = 0

async function solvedToken({ app }: SolvedTokenParams): Promise<string> {
    if (app === null) {
        throw new Error('test app is not ready')
    }
    requests += 1
    const response = await app.inject({
        method: 'GET',
        url: '/api/v1/authentication/captcha/challenge',
        headers: { 'x-real-ip': `172.31.${Math.floor(requests / 250) % 250}.${requests % 250 + 1}` },
    })
    const challenge: CaptchaChallenge = response.json()
    const solution = captchaPow.solve({ challenge })
    if (solution === null) {
        throw new Error('captcha challenge was not solvable')
    }
    return captchaPow.encodeSolution({ solution })
}

export const captchaHelper = {
    solvedToken,
}

type SolvedTokenParams = {
    app: FastifyInstance | null
}
