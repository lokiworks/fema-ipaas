export enum RateLimitUnit {
    PER_ENTERPRISE = 'PER_ENTERPRISE',
    PER_API_APP_TENANT = 'PER_API_APP_TENANT',
    UNDECLARED = 'UNDECLARED',
}

export const rateLimitUnitUtils = {
    of,
}

function of({ connectorName }: { connectorName: string | null | undefined }): RateLimitUnit {
    const declared = DECLARED_UNITS.find((entry) => connectorName === entry.connector || connectorName?.endsWith(`connector-${entry.connector}`) === true)
    return declared?.unit ?? RateLimitUnit.UNDECLARED
}

const DECLARED_UNITS: { connector: string, unit: RateLimitUnit }[] = [
    { connector: 'beisen', unit: RateLimitUnit.PER_ENTERPRISE },
    { connector: 'feishu', unit: RateLimitUnit.PER_API_APP_TENANT },
]
