import { describe, expect, it } from 'vitest'
import { aiReferences } from '../../../../src/app/ai/ai-references'

describe('aiReferences.canonicalize', () => {
    it('rewrites the short trigger and step references the model tends to write', () => {
        expect(aiReferences.canonicalize('{{trigger.Name}} / {{step_2.open_id}}')).toBe('{{trigger[\'output\'][\'Name\']}} / {{step_2[\'output\'][\'open_id\']}}')
    })

    it('keeps nested fields and list positions', () => {
        expect(aiReferences.canonicalize('{{ trigger.body.items[0].sku }}')).toBe('{{trigger[\'output\'][\'body\'][\'items\'][0][\'sku\']}}')
    })

    it('does not add a second output segment when the model already wrote one', () => {
        expect(aiReferences.canonicalize('{{step_1.output.departmentId}}')).toBe('{{step_1[\'output\'][\'departmentId\']}}')
    })

    it('leaves references that are already in the canonical form alone', () => {
        const canonical = '{{trigger[\'output\'][\'Name\']}} {{connections[\'abc\']}}'
        expect(aiReferences.canonicalize(canonical)).toBe(canonical)
    })

    it('leaves text without references and other mustache expressions alone', () => {
        expect(aiReferences.canonicalize('plain {{ 1 + 1 }} text')).toBe('plain {{ 1 + 1 }} text')
    })

    it('walks into objects and arrays and leaves other values as they are', () => {
        expect(aiReferences.canonicalize({ a: ['{{trigger.x}}', 3, null], b: { c: true } })).toEqual({ a: ['{{trigger[\'output\'][\'x\']}}', 3, null], b: { c: true } })
    })
})
