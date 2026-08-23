import { buildComponentRegistry } from '@fema-ipaas/component-sdk'
import { collectionTransformComponent } from './lib/data/collection-transform'
import { dateTransformComponent } from './lib/data/date-transform'
import { filterComponent } from './lib/data/filter'
import { jsonTransformComponent } from './lib/data/json-transform'
import { mapperComponent } from './lib/data/mapper'
import { setVariableComponent } from './lib/data/set-variable'
import { textTransformComponent } from './lib/data/text-transform'
import { approvalComponent, approvalLinkComponent } from './lib/human/approval'
import { delayComponent } from './lib/runtime/delay'
import { delayUntilComponent } from './lib/runtime/delay-until'
import { httpResponseComponent, stopComponent } from './lib/runtime/http-response'

export const componentRegistry = buildComponentRegistry([
    setVariableComponent,
    mapperComponent,
    filterComponent,
    jsonTransformComponent,
    textTransformComponent,
    dateTransformComponent,
    collectionTransformComponent,
    delayComponent,
    delayUntilComponent,
    httpResponseComponent,
    stopComponent,
    approvalComponent,
    approvalLinkComponent,
])

export {
    approvalComponent,
    approvalLinkComponent,
    collectionTransformComponent,
    dateTransformComponent,
    delayComponent,
    delayUntilComponent,
    filterComponent,
    httpResponseComponent,
    jsonTransformComponent,
    mapperComponent,
    setVariableComponent,
    stopComponent,
    textTransformComponent,
}
