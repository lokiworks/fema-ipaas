import { SsoLoginErrorCode } from '@fema-ipaas/shared'

export class SsoLoginError extends Error {
    readonly code: SsoLoginErrorCode
    readonly detail: string

    constructor({ code, detail }: SsoLoginErrorParams) {
        super(`${code}: ${detail}`)
        this.name = 'SsoLoginError'
        this.code = code
        this.detail = detail
    }
}

export function isSsoLoginError(error: unknown): error is SsoLoginError {
    return error instanceof SsoLoginError
}

type SsoLoginErrorParams = {
    code: SsoLoginErrorCode
    detail: string
}
