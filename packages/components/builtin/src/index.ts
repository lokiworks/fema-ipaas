import { buildComponentRegistry } from '@fema-ipaas/component-sdk'
import { approvalComponent, approvalLinkComponent } from './lib/human/approval'
import { delayComponent } from './lib/runtime/delay'
import { delayUntilComponent } from './lib/runtime/delay-until'
import { httpResponseComponent, stopComponent } from './lib/runtime/http-response'

export const componentRegistry = buildComponentRegistry([
    delayComponent,
    delayUntilComponent,
    httpResponseComponent,
    stopComponent,
    approvalComponent,
    approvalLinkComponent,
])

export { approvalComponent, approvalLinkComponent, delayComponent, delayUntilComponent, httpResponseComponent, stopComponent }
