import { DomainModule } from '../support/route-review'
import { identityDomain } from './identity'
import { integrationsDomain } from './integrations'
import { machineDomain } from './machine'
import { runtimeDomain } from './runtime'
import { workspaceDomain } from './workspace'

export const securityDomains: Record<string, DomainModule> = {
    workspace: workspaceDomain,
    runtime: runtimeDomain,
    integrations: integrationsDomain,
    identity: identityDomain,
    machine: machineDomain,
}
