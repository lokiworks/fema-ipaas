import { repoFactory } from '../core/db/repo-factory'
import { NetworkAgentEntity } from './network-agent.entity'

export const networkAgentRepo = repoFactory(NetworkAgentEntity)
