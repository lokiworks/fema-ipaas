import { blueprintRuntime } from './lib/core/connector/blueprint-runtime/blueprint-runtime'
import { connectorChild } from './lib/core/connector/connector-child'

blueprintRuntime.install()
connectorChild.listen()
