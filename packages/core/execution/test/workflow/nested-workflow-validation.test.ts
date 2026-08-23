import { CodeAction, WorkflowActionType, WorkflowOperationType, WorkflowTriggerType } from '../../src'
import { WorkflowAction as WorkflowActionSchema } from '../../src/lib/workflows/actions/action'
import { WorkflowOperationRequest } from '../../src/lib/workflows/operations'

function buildCodeAction({ name, nextAction }: { name: string, nextAction?: CodeAction }): CodeAction {
    return {
        name,
        type: WorkflowActionType.CODE,
        valid: true,
        displayName: name,
        lastUpdatedDate: '2026-05-02T00:00:00.000Z',
        settings: {
            sourceCode: { code: '', packageJson: '{}' },
            input: {},
        },
        nextAction,
    }
}

function buildChain({ depth, tail }: { depth: number, tail?: CodeAction }): CodeAction {
    let head = tail ?? buildCodeAction({ name: 'step_tail' })
    for (let i = depth; i > 0; i--) {
        head = buildCodeAction({ name: `step_${i}`, nextAction: head })
    }
    return head
}

describe('Nested workflow validation (GIT-1593)', () => {
    it('rejects a deeply nested chain with one invalid node without exponential backtracking', () => {
        const invalidTail = {
            ...buildCodeAction({ name: 'step_tail' }),
            settings: { input: {} },
        } as unknown as CodeAction
        const chain = buildChain({ depth: 200, tail: invalidTail })
        const result = WorkflowActionSchema.safeParse(chain)
        expect(result.success).toBe(false)
    })

    it('parses a deeply nested valid chain', () => {
        const chain = buildChain({ depth: 200 })
        const result = WorkflowActionSchema.safeParse(chain)
        expect(result.success).toBe(true)
    })

    it('accepts a valid IMPORT_WORKFLOW operation', () => {
        const result = WorkflowOperationRequest.safeParse({
            type: WorkflowOperationType.IMPORT_WORKFLOW,
            request: {
                displayName: 'workflow',
                schemaVersion: null,
                notes: null,
                trigger: {
                    name: 'trigger',
                    valid: true,
                    displayName: 'Trigger',
                    lastUpdatedDate: '2026-05-02T00:00:00.000Z',
                    type: WorkflowTriggerType.EMPTY,
                    settings: {},
                },
            },
        })
        expect(result.success).toBe(true)
    })

    it('rejects an operation with an unknown type', () => {
        const result = WorkflowOperationRequest.safeParse({
            type: 'NOT_A_REAL_OPERATION',
            request: {},
        })
        expect(result.success).toBe(false)
    })

    it('rejects an invalid IMPORT_WORKFLOW operation', () => {
        const result = WorkflowOperationRequest.safeParse({
            type: WorkflowOperationType.IMPORT_WORKFLOW,
            request: {
                displayName: 'workflow',
                schemaVersion: null,
                notes: null,
                trigger: {
                    name: 'trigger',
                    valid: true,
                    displayName: 'Trigger',
                    lastUpdatedDate: '2026-05-02T00:00:00.000Z',
                    type: WorkflowTriggerType.CONNECTOR,
                    settings: {},
                },
            },
        })
        expect(result.success).toBe(false)
    })
})
