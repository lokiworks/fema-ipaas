import { isNil } from '@fema/core-utils'

import { createVariableResolver } from '../connector-context/variable-resolver'

export const variableToken = {
    async handle(params: VariableTokenParams): Promise<unknown> {
        const { variableName, engineToken, workspaceId, apiUrl, censoredInput } = params
        const name = parseVariableName(variableName)
        if (isNil(name)) {
            return ''
        }
        if (censoredInput) {
            return '**REDACTED**'
        }
        return createVariableResolver({ engineToken, workspaceId, apiUrl }).obtain(name)
    },
}

function parseVariableName(variableName: string): string | null {
    if (variableName.startsWith(`${VARIABLES}[`)) {
        const match = variableName.match(/\['([^']+)'\]/)
        return match ? match[1] : null
    }
    if (variableName.startsWith(`${VARIABLES}.`)) {
        return variableName.split('.')[1] ?? null
    }
    return null
}

const VARIABLES = 'variables'

type VariableTokenParams = {
    variableName: string
    engineToken: string
    workspaceId: string
    apiUrl: string
    censoredInput: boolean
}
