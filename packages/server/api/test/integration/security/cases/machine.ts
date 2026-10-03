import { DomainModule } from '../support/route-review'
import { machineReviews } from './reviews-machine'

export const machineDomain: DomainModule = {
    cases: [],
    reviews: machineReviews,
    exemptions: {},
}
