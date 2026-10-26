import { isObject } from '@fema-ipaas/core-utils';
import { ActionBase, ActionReliability } from '../connector-metadata';
import { PropertyType } from '../property';

function violationsOf({ connector }: { connector: ContractConnector }): string[] {
  const actions = connector.actions();
  return Object.values(actions).flatMap((action) => actionViolations({ action, actions }));
}

function actionViolations({ action, actions }: { action: ActionBase; actions: Record<string, ActionBase> }): string[] {
  const errors: string[] = [];
  const report = (message: string): void => { errors.push(`${action.name}: ${message}`); };
  const reliability = action.reliability;
  if (!ActionReliability.safeParse(reliability ?? {}).success) {
    report('invalid reliability declaration');
  }
  if ((action.classification === 'WRITE' || action.classification === 'DESTRUCTIVE') && !reliability?.writeSafety) {
    report('mutations must declare writeSafety');
  }
  if (reliability?.writeSafety === 'LOOKUP_BEFORE_WRITE') {
    if (!reliability.lookupKeys?.length) {
      report('LOOKUP_BEFORE_WRITE must declare lookupKeys');
    }
    for (const key of reliability.lookupKeys ?? []) {
      if (!Object.hasOwn(action.props, key)) {
        report(`lookupKeys references missing property ${key}`);
      }
    }
  }
  if (reliability?.readBack && actions[reliability.readBack.actionName]?.classification !== 'READ') {
    report('readBack must reference a READ action in the same connector');
  }
  if (action.requireAuth && !reliability?.rateLimits?.length) {
    report('authenticated actions must declare rateLimits');
  }
  const buckets = reliability?.rateLimits?.map((limit) => limit.bucket) ?? [];
  if (new Set(buckets).size !== buckets.length) {
    report('rate limit buckets must be unique');
  }
  if (reliability?.enumeration) {
    if (action.classification !== 'SEARCH') {
      report('enumeration must be SEARCH');
    }
    if (action.props['pageToken']?.type !== PropertyType.SHORT_TEXT || action.props['pageToken'].required) {
      report('enumeration requires optional text pageToken');
    }
    if (action.props['pageSize']?.type !== PropertyType.NUMBER) {
      report('enumeration requires numeric pageSize');
    }
    const fields = action.outputSchema?.fields ?? [];
    if (!fields.some((field) => field.key === 'items' && field.listItems) || !fields.some((field) => field.key === 'nextPageToken')) {
      report('enumeration outputSchema requires items and nextPageToken');
    }
    if (!reliability.enumeration.businessKeyPath.trim()) {
      report('enumeration requires a business key path');
    }
  }
  if (reliability?.writeSafety && action.aiMetadata?.idempotent !== (reliability.writeSafety !== 'UNSAFE')) {
    report('aiMetadata.idempotent must agree with writeSafety');
  }
  if (reliability?.dedupeKeyProp && !Object.hasOwn(action.props, reliability.dedupeKeyProp)) {
    report('dedupeKeyProp references a missing property');
  }
  if (reliability?.dedupeWindowSeconds && !reliability.dedupeKeyProp) {
    report('dedupeWindowSeconds requires dedupeKeyProp');
  }
  return errors;
}

function pageViolationsOf({ action, output }: { action: ActionBase; output: unknown }): string[] {
  if (!action.reliability?.enumeration) {
    return [];
  }
  if (!isObject(output) || !Array.isArray(output['items']) || !(output['nextPageToken'] === null || typeof output['nextPageToken'] === 'string')) {
    return [`${action.name}: enumeration must return { items, nextPageToken }`];
  }
  const path = action.reliability.enumeration.businessKeyPath.split('.');
  return output['items'].flatMap((item: unknown, index: number) => {
    const key = path.reduce<unknown>((value, part) => isObject(value) ? value[part] : undefined, item);
    return isObject(item) && (typeof key === 'string' && key.length > 0 || typeof key === 'number' && Number.isFinite(key))
      ? []
      : [`${action.name}: item ${index} has no business key`];
  });
}

export const connectorContract = { violationsOf, pageViolationsOf };

type ContractConnector = { actions: () => Record<string, ActionBase> };
