import { customAlphabet } from 'nanoid'
import * as z from 'zod/mini'

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const ID_LENGTH = 21

export const EntityId = z.string().check(z.regex(new RegExp(`^[0-9a-zA-Z]{${ID_LENGTH}}$`)))

export type EntityId = z.infer<typeof EntityId>

export const generateId = customAlphabet(ALPHABET, ID_LENGTH)

export const secureApId = (length: number) => customAlphabet(ALPHABET, length)()

export type WorkspaceId = EntityId
export type ExecutionId = EntityId
export type WorkflowId = EntityId
export type WorkflowVersionId = EntityId
export type TenantId = EntityId
export type UserId = EntityId
