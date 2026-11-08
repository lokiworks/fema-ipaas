import { DomainModule } from '../support/route-review'
import { identityAccessRequestCases } from './identity-access-requests'
import { identityAccountCases, identityInvitationCases } from './identity-accounts'
import { identityProjectCases } from './identity-projects'
import { identityTenantCases } from './identity-tenant'
import { identityReviews } from './reviews-identity'

export const identityDomain: DomainModule = {
    cases: [...identityAccountCases, ...identityInvitationCases, ...identityAccessRequestCases, ...identityProjectCases, ...identityTenantCases],
    reviews: identityReviews,
    exemptions: {},
}
