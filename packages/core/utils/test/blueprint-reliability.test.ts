import { readFileSync } from 'node:fs'
import path from 'node:path'
import { blueprintFactory, blueprintProblems, ConnectorBlueprintDefinition, BlueprintIssueCode, BlueprintHttpMethod } from '../src/lib/connector-blueprint'

const definition = ConnectorBlueprintDefinition.parse(JSON.parse(readFileSync(path.resolve(__dirname, '../../../../docs/build-connectors/examples/kingdee-k3cloud.json'), 'utf8')))

it('accepts the Kingdee manifest with an executable lookup-before-write guard', () => {
  expect(blueprintProblems.publish({ definition, authPublished: true })).toEqual([])
  expect(definition.operations.find((operation) => operation.key === 'save')?.lookupBeforeWrite?.operationKey).toBe('query_by_number')
})

it('rejects a lookup that is missing or points to a mutating action', () => {
  const save = definition.operations.find((operation) => operation.key === 'save')
  if (!save) throw new Error('Missing save example')
  const invalid = { ...definition, operations: [...definition.operations.filter((operation) => operation.key !== 'save'), { ...save, lookupBeforeWrite: { operationKey: 'audit', matchPath: '' } }] }
  expect(blueprintProblems.publish({ definition: invalid, authPublished: true }).some((issue) => issue.code === BlueprintIssueCode.OPERATION_INVALID && issue.key === 'save')).toBe(true)
})

it('keeps undeclared legacy operations publishable and conservatively handled by the engine', () => {
  const operation = blueprintFactory.operation({ key: 'legacy', name: 'Legacy operation', method: BlueprintHttpMethod.POST, path: '/legacy', group: '' })
  expect(blueprintProblems.publish({ definition: { ...definition, operations: [operation] }, authPublished: true })).toEqual([])
})
