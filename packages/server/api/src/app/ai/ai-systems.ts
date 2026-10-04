import { CatalogEntry } from './ai-plan-steps'

export const aiSystems = {
    unavailable,
}

function unavailable({ prompt, catalog }: { prompt: string, catalog: CatalogEntry[] }): string[] {
    const installed = catalog.map((connector) => `${connector.displayName} ${connector.name}`)
    return KNOWN_SYSTEMS
        .filter((system) => system.aliases.some((alias) => mentions({ text: prompt, alias })))
        .filter((system) => !system.aliases.some((alias) => installed.some((entry) => mentions({ text: entry, alias }))))
        .map((system) => system.label)
}

function mentions({ text, alias }: { text: string, alias: string }): boolean {
    const lowered = text.toLowerCase()
    const needle = alias.toLowerCase()
    if (!ASCII_ALIAS.test(needle)) {
        return lowered.includes(needle)
    }
    return new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`).test(lowered)
}

const ASCII_ALIAS = /^[a-z0-9]+$/

const KNOWN_SYSTEMS: KnownSystem[] = [
    { label: '钉钉', aliases: ['钉钉', 'dingtalk'] },
    { label: '企业微信', aliases: ['企业微信', 'wecom'] },
    { label: '金蝶', aliases: ['金蝶', 'kingdee'] },
    { label: '用友', aliases: ['用友', 'yonyou'] },
    { label: 'SAP', aliases: ['sap'] },
    { label: '泛微', aliases: ['泛微', 'weaver'] },
    { label: '致远', aliases: ['致远', 'seeyon'] },
    { label: 'Moka', aliases: ['moka'] },
    { label: '飞书人事', aliases: ['飞书人事'] },
    { label: 'Salesforce', aliases: ['salesforce'] },
    { label: 'Jira', aliases: ['jira'] },
    { label: 'GitHub', aliases: ['github'] },
    { label: 'Slack', aliases: ['slack'] },
    { label: 'Notion', aliases: ['notion'] },
]

type KnownSystem = {
    label: string
    aliases: string[]
}
