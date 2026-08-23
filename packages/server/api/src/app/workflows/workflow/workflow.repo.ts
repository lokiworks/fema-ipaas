import { repoFactory } from '../../core/db/repo-factory'
import { WorkflowEntity } from './workflow.entity'

export const workflowRepo = repoFactory(WorkflowEntity)
