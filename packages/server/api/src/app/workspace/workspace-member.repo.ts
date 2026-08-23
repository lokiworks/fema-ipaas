import { repoFactory } from '../core/db/repo-factory'
import { WorkspaceMemberEntity } from './workspace-member.entity'

export const workspaceMemberRepo = repoFactory(WorkspaceMemberEntity)
