import { isNil } from '../utils'
import { blueprintTemplate } from './blueprint-template'

export const blueprintExpression = {
    isValid(expression: string): boolean {
        if (expression.trim().length === 0) {
            return true
        }
        try {
            parse(expression)
            return true
        }
        catch {
            return false
        }
    },
    evaluate({ expression, values }: EvaluateParams): boolean {
        if (expression.trim().length === 0) {
            return true
        }
        try {
            return truthy(evaluateNode({ node: parse(expression), values }))
        }
        catch {
            return true
        }
    },
    references(expression: string): string[] {
        try {
            return [...new Set(collectPaths(parse(expression)).map(inputKeyOf).filter((key): key is string => !isNil(key)))]
        }
        catch {
            return []
        }
    },
}

function parse(expression: string): ExpressionNode {
    const tokens = tokenize(expression)
    const cursor = { position: 0 }
    const node = parseOr({ tokens, cursor })
    if (cursor.position !== tokens.length) {
        throw new Error(`Unexpected token ${tokens[cursor.position].value}`)
    }
    return node
}

function tokenize(expression: string): Token[] {
    const tokens: Token[] = []
    let index = 0
    while (index < expression.length) {
        const char = expression[index]
        if (/\s/.test(char)) {
            index += 1
            continue
        }
        const operator = OPERATORS.find((candidate) => expression.startsWith(candidate, index))
        if (!isNil(operator)) {
            tokens.push({ kind: 'operator', value: operator })
            index += operator.length
            continue
        }
        if (char === '(' || char === ')') {
            tokens.push({ kind: 'paren', value: char })
            index += 1
            continue
        }
        if (char === '\'' || char === '"') {
            const end = expression.indexOf(char, index + 1)
            if (end === -1) {
                throw new Error('Unterminated string')
            }
            tokens.push({ kind: 'string', value: expression.slice(index + 1, end) })
            index = end + 1
            continue
        }
        const numberMatch = /^-?\d+(\.\d+)?/.exec(expression.slice(index))
        if (!isNil(numberMatch)) {
            tokens.push({ kind: 'number', value: numberMatch[0] })
            index += numberMatch[0].length
            continue
        }
        const pathMatch = /^[A-Za-z_][A-Za-z0-9_.[\]]*/.exec(expression.slice(index))
        if (!isNil(pathMatch)) {
            tokens.push({ kind: 'path', value: pathMatch[0] })
            index += pathMatch[0].length
            continue
        }
        throw new Error(`Unexpected character ${char}`)
    }
    return tokens
}

function parseOr({ tokens, cursor }: ParserState): ExpressionNode {
    let left = parseAnd({ tokens, cursor })
    while (peekOperator({ tokens, cursor }) === '||') {
        cursor.position += 1
        left = { kind: 'binary', operator: '||', left, right: parseAnd({ tokens, cursor }) }
    }
    return left
}

function parseAnd({ tokens, cursor }: ParserState): ExpressionNode {
    let left = parseUnary({ tokens, cursor })
    while (peekOperator({ tokens, cursor }) === '&&') {
        cursor.position += 1
        left = { kind: 'binary', operator: '&&', left, right: parseUnary({ tokens, cursor }) }
    }
    return left
}

function parseUnary({ tokens, cursor }: ParserState): ExpressionNode {
    if (peekOperator({ tokens, cursor }) === '!') {
        cursor.position += 1
        return { kind: 'not', operand: parseUnary({ tokens, cursor }) }
    }
    return parseComparison({ tokens, cursor })
}

function parseComparison({ tokens, cursor }: ParserState): ExpressionNode {
    const left = parsePrimary({ tokens, cursor })
    const operator = peekOperator({ tokens, cursor })
    if (!isNil(operator) && COMPARISON_OPERATORS.includes(operator)) {
        cursor.position += 1
        return { kind: 'binary', operator, left, right: parsePrimary({ tokens, cursor }) }
    }
    return left
}

function parsePrimary({ tokens, cursor }: ParserState): ExpressionNode {
    const token = tokens[cursor.position]
    if (isNil(token)) {
        throw new Error('Unexpected end of expression')
    }
    cursor.position += 1
    switch (token.kind) {
        case 'paren': {
            if (token.value !== '(') {
                throw new Error('Unexpected )')
            }
            const inner = parseOr({ tokens, cursor })
            const closing = tokens[cursor.position]
            if (isNil(closing) || closing.value !== ')') {
                throw new Error('Missing )')
            }
            cursor.position += 1
            return inner
        }
        case 'string':
            return { kind: 'literal', value: token.value }
        case 'number':
            return { kind: 'literal', value: Number(token.value) }
        case 'path':
            return literalOrPath(token.value)
        case 'operator':
            throw new Error(`Unexpected operator ${token.value}`)
    }
}

function literalOrPath(value: string): ExpressionNode {
    switch (value) {
        case 'true':
            return { kind: 'literal', value: true }
        case 'false':
            return { kind: 'literal', value: false }
        case 'null':
            return { kind: 'literal', value: null }
        default:
            return { kind: 'path', path: value }
    }
}

function peekOperator({ tokens, cursor }: ParserState): string | undefined {
    const token = tokens[cursor.position]
    return token?.kind === 'operator' ? token.value : undefined
}

function evaluateNode({ node, values }: { node: ExpressionNode, values: Record<string, unknown> }): unknown {
    switch (node.kind) {
        case 'literal':
            return node.value
        case 'path':
            return readValue({ path: node.path, values })
        case 'not':
            return !truthy(evaluateNode({ node: node.operand, values }))
        case 'binary':
            return evaluateBinary({ node, values })
    }
}

function evaluateBinary({ node, values }: { node: BinaryNode, values: Record<string, unknown> }): unknown {
    if (node.operator === '&&') {
        return truthy(evaluateNode({ node: node.left, values })) && truthy(evaluateNode({ node: node.right, values }))
    }
    if (node.operator === '||') {
        return truthy(evaluateNode({ node: node.left, values })) || truthy(evaluateNode({ node: node.right, values }))
    }
    const left = evaluateNode({ node: node.left, values })
    const right = evaluateNode({ node: node.right, values })
    switch (node.operator) {
        case '==':
        case '===':
            return looseEquals({ left, right })
        case '!=':
        case '!==':
            return !looseEquals({ left, right })
        case '>':
            return Number(left) > Number(right)
        case '<':
            return Number(left) < Number(right)
        case '>=':
            return Number(left) >= Number(right)
        case '<=':
            return Number(left) <= Number(right)
        default:
            throw new Error(`Unknown operator ${node.operator}`)
    }
}

function readValue({ path, values }: { path: string, values: Record<string, unknown> }): unknown {
    const key = inputKeyOf(path)
    if (!isNil(key) && !path.includes('.')) {
        return values[key]
    }
    const normalized = /^(input|settings)\./.test(path) ? path.replace(/^(input|settings)\./, '') : path
    return blueprintTemplate.readPath({ source: values, path: normalized })
}

function inputKeyOf(path: string): string | undefined {
    const match = /^(?:(?:input|settings)\.)?([A-Za-z_][A-Za-z0-9_]*)/.exec(path)
    return match?.[1]
}

function collectPaths(node: ExpressionNode): string[] {
    switch (node.kind) {
        case 'literal':
            return []
        case 'path':
            return [node.path]
        case 'not':
            return collectPaths(node.operand)
        case 'binary':
            return [...collectPaths(node.left), ...collectPaths(node.right)]
    }
}

function looseEquals({ left, right }: { left: unknown, right: unknown }): boolean {
    if (isNil(left) || isNil(right)) {
        return (isNil(left) && isNil(right)) || (left === '' && isNil(right)) || (isNil(left) && right === '')
    }
    return String(left) === String(right)
}

function truthy(value: unknown): boolean {
    if (Array.isArray(value)) {
        return value.length > 0
    }
    return Boolean(value)
}

const OPERATORS = ['===', '!==', '==', '!=', '>=', '<=', '&&', '||', '>', '<', '!']
const COMPARISON_OPERATORS = ['===', '!==', '==', '!=', '>=', '<=', '>', '<']

type Token = {
    kind: 'operator' | 'paren' | 'string' | 'number' | 'path'
    value: string
}

type ParserState = {
    tokens: Token[]
    cursor: { position: number }
}

type BinaryNode = {
    kind: 'binary'
    operator: string
    left: ExpressionNode
    right: ExpressionNode
}

type ExpressionNode =
    | { kind: 'literal', value: string | number | boolean | null }
    | { kind: 'path', path: string }
    | { kind: 'not', operand: ExpressionNode }
    | BinaryNode

type EvaluateParams = {
    expression: string
    values: Record<string, unknown>
}
