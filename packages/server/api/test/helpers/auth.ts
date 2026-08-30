import { Principal } from '@fema-ipaas/shared'
import jwt, { Algorithm, SignOptions } from 'jsonwebtoken'

const generateToken = ({
    payload,
    algorithm = 'HS256',
    key = 'secret',
    keyId = '1',
    issuer = 'fema',
}: GenerateTokenParams): string => {
    const options: SignOptions = {
        algorithm,
        expiresIn: '1h',
        keyid: keyId,
        issuer,
    }

    return jwt.sign(payload, key, options)
}

export const generateMockToken = async (
    principal: Principal,
): Promise<string> => {
    const mockPrincipal: Principal = principal

    return generateToken({
        payload: mockPrincipal,
        issuer: 'fema',
    })
}

type GenerateTokenParams = {
    payload: Record<string, unknown>
    algorithm?: Algorithm
    key?: string
    keyId?: string
    issuer?: string
}
