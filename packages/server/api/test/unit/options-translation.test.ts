import { describe, expect, it } from 'vitest'
import { optionsTranslation } from '../../src/app/connectors/metadata/utils/options-translation'

const i18n = {
    'Connect your Feishu app first': '请先建立飞书连接',
    'Chat': '群聊',
    'Pick one': '请选择',
}

describe('optionsTranslation.translateOptionsResult', () => {
    it('translates the placeholder of a dropdown result and keeps the options untouched', () => {
        const result = {
            type: 'DROPDOWN',
            options: { disabled: true, placeholder: 'Connect your Feishu app first', options: [{ label: 'Chat', value: 1 }] },
        }
        expect(optionsTranslation.translateOptionsResult({ result, i18n })).toEqual({
            type: 'DROPDOWN',
            options: { disabled: true, placeholder: '请先建立飞书连接', options: [{ label: 'Chat', value: 1 }] },
        })
    })

    it('translates display names, descriptions and static option labels of dynamic properties', () => {
        const result = {
            type: 'DYNAMIC',
            options: {
                chat: {
                    displayName: 'Chat',
                    description: 'Pick one',
                    options: { options: [{ label: 'Chat', value: 'a' }] },
                },
            },
        }
        expect(optionsTranslation.translateOptionsResult({ result, i18n })).toEqual({
            type: 'DYNAMIC',
            options: {
                chat: {
                    displayName: '群聊',
                    description: '请选择',
                    options: { options: [{ label: '群聊', value: 'a' }] },
                },
            },
        })
    })

    it('returns the result unchanged without translations', () => {
        const result = { type: 'DROPDOWN', options: { placeholder: 'Connect your Feishu app first' } }
        expect(optionsTranslation.translateOptionsResult({ result, i18n: undefined })).toBe(result)
    })

    it('leaves unknown texts as they are', () => {
        const result = { type: 'DROPDOWN', options: { placeholder: 'Unknown' } }
        expect(optionsTranslation.translateOptionsResult({ result, i18n })).toEqual(result)
    })
})
