
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConnectorProperty } from '@fema/connector-sdk'

export type ProcessorFn<INPUT = any, OUTPUT = any> = (
    property: ConnectorProperty,
    value: INPUT,
) => OUTPUT
