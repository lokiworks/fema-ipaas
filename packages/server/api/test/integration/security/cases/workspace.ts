import { DomainModule } from '../support/route-review'
import { workspaceReviews } from './reviews-workspace'
import { workflowCases } from './workflows'
import { workspaceDataStoreCases, workspaceMappingTableCases, workspaceVariableCases } from './workspace-data'
import { workspaceBatchCases, workspaceFolderCases } from './workspace-folders'
import { workspaceReleaseCases } from './workspace-releases'
import { workspaceSolutionCases, workspaceTemplateCases } from './workspace-solutions'
import { workspaceTriggerCases } from './workspace-triggers'
import { workspaceWorkflowCases } from './workspace-workflows'

export const workspaceDomain: DomainModule = {
    cases: [
        ...workflowCases,
        ...workspaceWorkflowCases,
        ...workspaceFolderCases,
        ...workspaceBatchCases,
        ...workspaceReleaseCases,
        ...workspaceVariableCases,
        ...workspaceDataStoreCases,
        ...workspaceMappingTableCases,
        ...workspaceSolutionCases,
        ...workspaceTemplateCases,
        ...workspaceTriggerCases,
    ],
    reviews: workspaceReviews,
    exemptions: {},
}
