import { blueprintRuntime } from './lib/core/connector/blueprint-runtime/blueprint-runtime'
import { connectorChild } from './lib/core/connector/connector-child'
import { ssrfGuard } from './lib/network/ssrf-guard'

ssrfGuard.install()

blueprintRuntime.install()
connectorChild.listen()
