import {
  BlueprintChangeKind,
  blueprintRules,
  ConnectorBlueprintDefinition,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';

function groupNames(definition: ConnectorBlueprintDefinition): string[] {
  const names = [
    ...definition.groups,
    ...definition.operations.map((operation) => operation.group),
  ].filter((name) => name.length > 0);
  return [...new Set(names)];
}

function groupsOf(definition: ConnectorBlueprintDefinition): WorkspaceGroup[] {
  const named = groupNames(definition).map((name) => ({
    name,
    operations: definition.operations.filter(
      (operation) => operation.group === name,
    ),
  }));
  const ungrouped = definition.operations.filter(
    (operation) => operation.group.length === 0,
  );
  return ungrouped.length > 0 || named.length === 0
    ? [...named, { name: '', operations: ungrouped }]
    : named;
}

function addGroup({
  definition,
  name,
}: {
  definition: ConnectorBlueprintDefinition;
  name: string;
}): ConnectorBlueprintDefinition {
  return { ...definition, groups: [...new Set([...definition.groups, name])] };
}

function renameGroup({
  definition,
  from,
  to,
}: {
  definition: ConnectorBlueprintDefinition;
  from: string;
  to: string;
}): ConnectorBlueprintDefinition {
  return {
    ...definition,
    groups: [
      ...new Set([
        ...definition.groups.map((name) => (name === from ? to : name)),
        to,
      ]),
    ],
    operations: definition.operations.map((operation) =>
      operation.group === from ? { ...operation, group: to } : operation,
    ),
  };
}

function removeGroup({
  definition,
  name,
}: {
  definition: ConnectorBlueprintDefinition;
  name: string;
}): ConnectorBlueprintDefinition {
  return {
    ...definition,
    groups: definition.groups.filter((group) => group !== name),
    operations: definition.operations.map((operation) =>
      operation.group === name ? { ...operation, group: '' } : operation,
    ),
  };
}

function takenOperationKeys(detail: ConnectorBlueprintDetail): string[] {
  return [
    ...detail.definition.operations.map((operation) => operation.key),
    ...(detail.publishedDefinition?.operations ?? []).map(
      (operation) => operation.key,
    ),
  ];
}

function takenTriggerKeys(detail: ConnectorBlueprintDetail): string[] {
  return [
    ...detail.definition.triggers.map((trigger) => trigger.key),
    ...(detail.publishedDefinition?.triggers ?? []).map(
      (trigger) => trigger.key,
    ),
  ];
}

function pendingKeys({
  detail,
  kind,
}: {
  detail: ConnectorBlueprintDetail;
  kind: BlueprintChangeKind;
}): string[] {
  return detail.changes
    .filter((change) => change.kind === kind)
    .map((change) => change.key);
}

function statusPending(detail: ConnectorBlueprintDetail): boolean {
  return detail.changes.some(
    (change) =>
      change.kind === BlueprintChangeKind.CONFIG &&
      change.changedFields.includes('status'),
  );
}

function basicTodo(detail: ConnectorBlueprintDetail): boolean {
  return (
    !blueprintRules.isHttpUrl(detail.definition.baseUrl) ||
    detail.definition.description.trim().length === 0
  );
}

function authTodo(detail: ConnectorBlueprintDetail): boolean {
  const auth = detail.definition.auth;
  return auth !== null && auth.enabled && !detail.authStatus.published;
}

export const blueprintWorkspaceUtils = {
  groupNames,
  groupsOf,
  addGroup,
  renameGroup,
  removeGroup,
  takenOperationKeys,
  takenTriggerKeys,
  pendingKeys,
  statusPending,
  basicTodo,
  authTodo,
};

export type WorkspaceGroup = {
  name: string;
  operations: ConnectorBlueprintDefinition['operations'];
};
