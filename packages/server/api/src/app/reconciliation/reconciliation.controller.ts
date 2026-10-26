import { ApplicationError, ErrorCode, Permission, SeekPage } from '@fema-ipaas/core-utils'
import { PrincipalType, ReconciliationDifference, ReconciliationRule, ReconciliationRuleBody, ReconciliationRun } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { In } from 'typeorm'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { reconciliationRepair } from './reconciliation-repair'
import { ReconciliationRuleEntity } from './reconciliation.entity'
import { reconciliationDifferenceRepo, reconciliationRunRepo, reconciliationService } from './reconciliation.service'

export const reconciliationController: FastifyPluginAsyncZod = async (app) => {
    app.get('/rules', { config: { security: readQuery }, schema: { querystring: ProjectQuery } }, async (request) => {
        const rules = await reconciliationService(request.log).listRules({ projectId: request.projectId })
        return Promise.all(rules.map(async (rule) => ({ ...rule, lastRun: await reconciliationRunRepo().findOne({ where: { projectId: request.projectId, ruleId: rule.id }, order: { created: 'DESC' } }) })))
    })
    app.post('/rules', { config: { security: writeBody }, schema: { body: ReconciliationRuleBody, response: { 200: ReconciliationRule } } }, async (request) => {
        return reconciliationService(request.log).saveRule({ projectId: request.projectId, body: request.body })
    })
    app.post('/rules/:id', { config: { security: writeRule }, schema: { params: IdParams, body: ReconciliationRuleBody, response: { 200: ReconciliationRule } } }, async (request) => {
        return reconciliationService(request.log).saveRule({ id: request.params.id, projectId: request.projectId, body: request.body })
    })
    app.delete('/rules/:id', { config: { security: writeRule }, schema: { params: IdParams } }, async (request, reply) => {
        await reconciliationService(request.log).deleteRule({ id: request.params.id, projectId: request.projectId })
        return reply.status(204).send()
    })
    app.post('/rules/:id/runs', { config: { security: writeRule }, schema: { params: IdParams, response: { 200: z.object({ runId: z.string() }) } } }, async (request) => {
        return reconciliationService(request.log).start({ id: request.params.id, projectId: request.projectId })
    })
    app.get('/runs/:id', { config: { security: readQuery }, schema: { params: IdParams, querystring: ProjectQuery, response: { 200: ReconciliationRun } } }, async (request) => {
        return reconciliationService(request.log).getRun({ id: request.params.id, projectId: request.projectId })
    })
    app.get('/rules/:id/differences', { config: { security: readQuery }, schema: { params: IdParams, querystring: ProjectQuery.extend({ status: ReconciliationDifference.shape.status.optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).optional() }), response: { 200: SeekPage(ReconciliationDifference) } } }, async (request) => {
        return reconciliationService(request.log).listDifferences({ ...request.query, id: request.params.id, projectId: request.projectId })
    })
    app.post('/differences/repair', { config: { security: writeBody }, schema: { body: DifferenceBatch } }, async (request) => {
        await requireDifferences({ ids: request.body.ids, projectId: request.projectId })
        const executionIds: string[] = []
        for (const differenceId of request.body.ids) {
            const executionId = await reconciliationRepair(request.log).start({ differenceId, projectId: request.projectId })
            if (executionId) executionIds.push(executionId)
        }
        return { executionIds }
    })
    app.post('/differences/ignore', { config: { security: writeBody }, schema: { body: DifferenceBatch.extend({ reason: z.string().trim().min(1, 'required').max(500, 'issueNoteTooLong') }) } }, async (request) => {
        await requireDifferences({ ids: request.body.ids, projectId: request.projectId })
        await reconciliationService(request.log).ignore({ ids: request.body.ids, projectId: request.projectId, reason: request.body.reason, actorId: request.principal.id })
        return {}
    })
}

async function requireDifferences({ ids, projectId }: { ids: string[], projectId: string }): Promise<void> {
    const count = await reconciliationDifferenceRepo().countBy({ id: In(ids), projectId })
    if (count !== new Set(ids).size) {
        throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'ReconciliationDifference' } })
    }
}

const ProjectQuery = z.object({ projectId: z.string() })
const IdParams = z.object({ id: z.string() })
const DifferenceBatch = ProjectQuery.extend({ ids: z.array(z.string()).min(1, 'required').max(200, 'reconciliation.tooManyRepairs') })
const readQuery = securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.QUERY })
const writeBody = securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY })
const writeRule = securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.TABLE, tableName: ReconciliationRuleEntity })
