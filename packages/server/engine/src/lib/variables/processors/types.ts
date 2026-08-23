
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PieceProperty } from '@fema/connector-sdk'

export type ProcessorFn<INPUT = any, OUTPUT = any> = (
    property: PieceProperty,
    value: INPUT,
) => OUTPUT
