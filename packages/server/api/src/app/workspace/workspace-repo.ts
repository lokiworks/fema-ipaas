import { repoFactory } from '../core/db/repo-factory'
import { WorkspaceEntity } from './workspace-entity'

export const workspaceRepo = repoFactory(WorkspaceEntity)
