import { buildComponentRegistry } from '@fema-ipaas/component-sdk'
import { delayComponent } from './lib/runtime/delay'

export const componentRegistry = buildComponentRegistry([
    delayComponent,
])

export { delayComponent }
