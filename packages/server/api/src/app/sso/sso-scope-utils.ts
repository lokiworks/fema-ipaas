function ensureOpenid(scopes: string): string {
    const parts = scopes.split(/\s+/).filter((part) => part.length > 0)
    return parts.includes('openid') ? parts.join(' ') : ['openid', ...parts].join(' ')
}

function withScope({ scopes, scope }: { scopes: string, scope: string }): string {
    const parts = scopes.split(/\s+/).filter((part) => part.length > 0)
    return parts.includes(scope) ? parts.join(' ') : [...parts, scope].join(' ')
}

export const ssoScopeUtils = {
    ensureOpenid,
    withScope,
}
