
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConnectorProperty } from '@fema-ipaas/connector-sdk'

export type ProcessorFn<INPUT = any, OUTPUT = any> = (
    property: ConnectorProperty,
    value: INPUT,
) => OUTPUT
