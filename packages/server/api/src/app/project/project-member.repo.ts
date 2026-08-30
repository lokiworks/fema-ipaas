import { repoFactory } from '../core/db/repo-factory'
import { ProjectMemberEntity } from './project-member.entity'

export const projectMemberRepo = repoFactory(ProjectMemberEntity)
