import { isNil, tryParseFriendlyConnectorError } from '@fema-ipaas/core-utils'

export const errorSanitizer = {
    stripLocalDetails,
    stripFailedStepMessage,
}

function stripLocalDetails({ text }: { text: string }): string {
    const friendly = tryParseFriendlyConnectorError(text)
    if (isNil(friendly)) {
        return stripText({ text })
    }
    const { raw: _raw, ...rest } = friendly
    return JSON.stringify({
        ...rest,
        message: stripText({ text: rest.message }),
        ...(isNil(rest.apiMessage) ? {} : { apiMessage: stripText({ text: rest.apiMessage }) }),
    })
}

function stripFailedStepMessage<T extends { message?: string }>({ failedStep }: { failedStep: T | undefined }): T | undefined {
    if (isNil(failedStep) || isNil(failedStep.message) || failedStep.message.length === 0) {
        return failedStep
    }
    return { ...failedStep, message: stripLocalDetails({ text: failedStep.message }) }
}

function stripText({ text }: { text: string }): string {
    const withoutFrames = text.replace(STACK_FRAME_LINES, '').replace(ESCAPED_STACK_FRAMES, '')
    return withoutFrames.replace(LOCAL_PATHS, LOCAL_PATH_PLACEHOLDER)
}

const LOCAL_PATH_PLACEHOLDER = '<path>'
const PATH_BODY = String.raw`[^\s"'` + '`' + String.raw`)\],;]+`
const STACK_FRAME_LINES = /\r?\n[ \t]*at[ \t]+\S[^\n]*/g
const ESCAPED_STACK_FRAMES = /\\n[ \t]*at[ \t]+[^\\"]*/g
const LOCAL_PATHS = new RegExp([
    String.raw`(?<![\w:/.-])\/(?:Users|home|root|private|tmp|opt|usr|srv|mnt|workspace)\/${PATH_BODY}`,
    String.raw`(?<![\w:/.-])\/var\/(?:folders|lib|run|tmp|log)\/${PATH_BODY}`,
    String.raw`(?<![\w:/.-])\/app\/(?:node_modules|dist|packages|cache|src)${PATH_BODY.replace('+', '*')}`,
    String.raw`(?<![\w])[A-Za-z]:\\${PATH_BODY}`,
    String.raw`file:\/\/${PATH_BODY}`,
    String.raw`node:internal\/${PATH_BODY}`,
].join('|'), 'g')
