function wordsOf(toolName: string): string[] {
    return toolName
        .split(/[_\-.\s]|(?=[A-Z])/)
        .map((word) => word.toLowerCase())
        .filter((word) => word.length > 0)
}

function looksLikeWrite(toolName: string): boolean {
    return wordsOf(toolName).some((word) => WRITE_VERBS.includes(word))
}

function needsApproval({ toolName, confirmWrites, confirmTools }: { toolName: string, confirmWrites: boolean, confirmTools: string[] }): boolean {
    return confirmTools.includes(toolName) || (confirmWrites && looksLikeWrite(toolName))
}

export const agentToolPolicy = {
    looksLikeWrite,
    needsApproval,
}

export const AGENT_WRITE_VERBS = ['create', 'add', 'send', 'update', 'delete', 'remove', 'post', 'put', 'patch', 'write', 'set', 'insert', 'upsert', 'cancel', 'approve', 'submit', 'transfer', 'pay', 'publish', 'reply', 'invite', 'assign']

const WRITE_VERBS = AGENT_WRITE_VERBS
