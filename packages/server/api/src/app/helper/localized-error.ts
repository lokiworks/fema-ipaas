import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'

export const localizedError = {
    validation({ key, params }: LocalizedErrorParams): never {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: {
                message: fill({ template: key, params }),
                messageKey: key,
                ...(params === undefined ? {} : { messageParams: params }),
            },
        })
    },

    authorization({ key }: { key: string }): never {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: key, messageKey: key },
        })
    },
}

function fill({ template, params }: { template: string, params: LocalizedErrorParams['params'] }): string {
    if (params === undefined) {
        return template
    }
    return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template)
}

type LocalizedErrorParams = {
    key: string
    params?: Record<string, string | number>
}
