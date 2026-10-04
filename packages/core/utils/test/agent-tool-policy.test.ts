import { agentToolPolicy } from '../src/lib/agent-tool-policy'

describe('agentToolPolicy.looksLikeWrite', () => {
    test.each([
        ['create_ticket', true],
        ['createTicket', true],
        ['ticket.create', true],
        ['send-message', true],
        ['update employee', true],
        ['delete_user', true],
        ['query_employee', false],
        ['list_tickets', false],
        ['get_creator', false],
        ['search', false],
        ['recreate_index', false],
    ])('%s -> %s', (toolName, expected) => {
        expect(agentToolPolicy.looksLikeWrite(toolName)).toBe(expected)
    })
})

describe('agentToolPolicy.needsApproval', () => {
    test('write-like tools ask while the write switch is on', () => {
        expect(agentToolPolicy.needsApproval({ toolName: 'create_ticket', confirmWrites: true, confirmTools: [] })).toBe(true)
        expect(agentToolPolicy.needsApproval({ toolName: 'create_ticket', confirmWrites: false, confirmTools: [] })).toBe(false)
    })

    test('a listed tool always asks, even a read-only one and with the write switch off', () => {
        expect(agentToolPolicy.needsApproval({ toolName: 'query_employee', confirmWrites: false, confirmTools: ['query_employee'] })).toBe(true)
        expect(agentToolPolicy.needsApproval({ toolName: 'query_employee', confirmWrites: true, confirmTools: [] })).toBe(false)
    })
})
