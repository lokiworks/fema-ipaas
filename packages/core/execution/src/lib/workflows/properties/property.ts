import { z } from 'zod'

export enum PropertyExecutionType {
    MANUAL = 'MANUAL',
    DYNAMIC = 'DYNAMIC',
    STRING = 'STRING',
    NUMBER = 'NUMBER',
    BOOLEAN = 'BOOLEAN',
    OBJECT = 'OBJECT',
    ARRAY = 'ARRAY',
    NULL = 'NULL',
}

export const PropertySettings = z.object({
    type: z.enum(PropertyExecutionType),
    schema: z.any().optional(),
})
export type PropertySettings = z.infer<typeof PropertySettings>
