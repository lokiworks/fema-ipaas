import { createHash } from 'node:crypto'
import { isObject } from '@fema-ipaas/core-utils'
import { ReconciliationRuleBody, SolutionPackage } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { reconciliationService } from '../reconciliation/reconciliation.service'

async function install({ pkg, projectId, workflows, connections, config, tableIdByKey, log }: InstallParams): Promise<void> {
    for (const template of pkg.reconciliationRules ?? []) {
        const workflow = workflows.find((item) => item.key === template.workflowKey)
        if (!workflow) throw new Error('A reconciliation rule references a missing solution workflow')
        const resolved = replace({ value: template, config, tableIdByKey })
        const body = ReconciliationRuleBody.parse({ ...template, ...(isObject(resolved) ? resolved : {}), projectId, workflowId: workflow.workflowId, source: { ...template.source, input: replace({ value: template.source.input, config, tableIdByKey }), connectionExternalId: connections[template.source.connectorName] }, target: { ...template.target, input: replace({ value: template.target.input, config, tableIdByKey }), connectionExternalId: connections[template.target.connectorName] } })
        const id = createHash('sha256').update(JSON.stringify([projectId, workflow.workflowId, template.key])).digest('hex').slice(0, 21)
        const service = reconciliationService(log)
        const exists = (await service.listRules({ projectId })).some((rule) => rule.id === id)
        await service.saveRule({ ...(exists ? { id } : { newRuleId: id }), projectId, body })
    }
}

function replace({ value, config, tableIdByKey }: ReplaceParams): unknown {
    if (typeof value === 'string') {
        if (value.startsWith('config:')) return config[value.slice(7)] ?? ''
        if (value.startsWith('table:')) return tableIdByKey.get(value.slice(6)) ?? value
        return value
    }
    if (Array.isArray(value)) return value.map((item: unknown) => replace({ value: item, config, tableIdByKey }))
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace({ value: item, config, tableIdByKey })]))
    return value
}

export const solutionReconciliation = { install }

type InstallParams = { pkg: SolutionPackage, projectId: string, workflows: { key: string, workflowId: string }[], connections: Record<string, string>, config: Record<string, string>, tableIdByKey: Map<string, string>, log: FastifyBaseLogger }
type ReplaceParams = { value: unknown, config: Record<string, string>, tableIdByKey: Map<string, string> }
