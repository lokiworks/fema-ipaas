import { isNil } from '@fema-ipaas/core-utils'
import { CreateTemplateRequestBody, GenerateTemplateFromWorkflowRequestBody, templateConnectionUtils, TemplateType, WorkflowVersion, WorkflowVersionTemplate } from '@fema-ipaas/shared'

import { workflowTransferTables } from '../project-workspace/workflow-transfer-tables'

export const templateFromWorkflow = {
    toWorkflowTemplate(version: WorkflowVersion): WorkflowVersionTemplate {
        return {
            displayName: version.displayName,
            trigger: workflowTransferTables.withoutLookupTables(templateConnectionUtils.stripTrigger(version.trigger)),
            valid: version.valid,
            schemaVersion: version.schemaVersion,
            notes: version.notes,
            graph: version.graph,
        }
    },
    buildCreateBody({ request, version, author, externalId }: BuildCreateBodyParams): CreateTemplateRequestBody {
        const category = request.category.trim()
        return {
            name: request.name.trim(),
            summary: request.description.trim(),
            description: request.description.trim(),
            tags: [],
            blogUrl: request.blogUrl === '' ? undefined : request.blogUrl,
            metadata: isNil(externalId) ? null : { externalId },
            author,
            categories: category === '' ? [] : [category],
            type: TemplateType.CUSTOM,
            workflows: [templateFromWorkflow.toWorkflowTemplate(version)],
        }
    },
    authorName({ firstName, lastName, email }: AuthorNameParams): string {
        const fullName = [firstName, lastName].map((part) => part?.trim() ?? '').filter((part) => part !== '').join(' ')
        return fullName === '' ? email : fullName
    },
}

type BuildCreateBodyParams = {
    request: GenerateTemplateFromWorkflowRequestBody
    version: WorkflowVersion
    author: string
    externalId: string | null
}

type AuthorNameParams = {
    firstName: string | null | undefined
    lastName: string | null | undefined
    email: string
}
