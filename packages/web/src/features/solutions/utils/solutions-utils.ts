import { isNil } from '@fema-ipaas/core-utils';
import {
  ConnectionWithoutSensitiveData,
  Solution,
  SolutionCheckResult,
  SolutionCheckResults,
  SolutionCheckStatus,
  SolutionConfigItem,
  SolutionConfigType,
  SolutionConnectionSlot,
  SolutionInstall,
  SolutionPackage,
  SolutionProvider,
  SolutionSummary,
  solutionUtils,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { connectionUtils } from '@/features/connections/utils/utils';

function categoriesOf(solutions: SolutionSummary[]): string[] {
  return [...new Set(solutions.map((solution) => solution.category))].sort();
}

function categoryLabel(category: string): string {
  switch (category.trim().toUpperCase()) {
    case 'FINANCE':
      return t('solutionCategoryFinance');
    case 'HR':
      return t('solutionCategoryHr');
    case 'IT':
      return t('solutionCategoryIt');
    case 'SALES':
      return t('solutionCategorySales');
    case 'OPERATIONS':
      return t('solutionCategoryOperations');
    case 'MARKETING':
      return t('solutionCategoryMarketing');
    case 'OTHER':
      return t('solutionCategoryOther');
    default:
      return category;
  }
}

function filterSolutions({
  solutions,
  category,
  search,
  mineOnly,
  userId,
}: {
  solutions: SolutionSummary[];
  category: string | null;
  search: string;
  mineOnly: boolean;
  userId: string | null;
}): SolutionSummary[] {
  const needle = search.trim().toLowerCase();
  return solutions
    .filter((solution) => !mineOnly || isOwn({ solution, userId }))
    .filter((solution) => isNil(category) || solution.category === category)
    .filter(
      (solution) =>
        needle.length === 0 ||
        `${solution.name} ${solution.summary} ${solution.connectorNames.join(
          ' ',
        )}`
          .toLowerCase()
          .includes(needle),
    );
}

function isOwn({
  solution,
  userId,
}: {
  solution: Pick<Solution, 'createdBy'>;
  userId: string | null;
}): boolean {
  return !isNil(userId) && solution.createdBy === userId;
}

function providerLabel(provider: SolutionProvider): string {
  return provider === SolutionProvider.OFFICIAL
    ? t('Official')
    : t('Your organization');
}

function hasNewerVersion(install: SolutionInstall): boolean {
  return solutionUtils.versionNewer({
    candidate: install.latestVersion,
    current: install.version,
  });
}

function effectiveConnections({
  slots,
  selected,
  available,
}: {
  slots: SolutionConnectionSlot[];
  selected: Record<string, string>;
  available: Record<string, ConnectionWithoutSensitiveData[]>;
}): Record<string, string> {
  return Object.fromEntries(
    slots.flatMap((slot) => {
      const externalId =
        selected[slot.connectorName] ??
        connectionUtils.onlyUsableConnection(
          available[slot.connectorName] ?? [],
        )?.externalId;
      return isNil(externalId) ? [] : [[slot.connectorName, externalId]];
    }),
  );
}

function missingSlots({
  slots,
  connections,
}: {
  slots: SolutionConnectionSlot[];
  connections: Record<string, string>;
}): SolutionConnectionSlot[] {
  return slots.filter((slot) => isNil(connections[slot.connectorName]));
}

function checkGate({
  results,
  acknowledged,
}: {
  results: SolutionCheckResult[];
  acknowledged: string[];
}): CheckGate {
  const failedBlocking = results.filter(
    (result) =>
      result.blocking &&
      result.status !== SolutionCheckStatus.PASS &&
      result.status !== SolutionCheckStatus.NEEDS_CONFIRM,
  );
  const needsAcknowledgement = results.filter(
    (result) =>
      result.status === SolutionCheckStatus.NEEDS_CONFIRM ||
      (!result.blocking && result.status !== SolutionCheckStatus.PASS),
  );
  const unacknowledged = needsAcknowledgement.filter(
    (result) => !acknowledged.includes(result.key),
  );
  return {
    failedBlocking,
    needsAcknowledgement,
    canContinue: failedBlocking.length === 0 && unacknowledged.length === 0,
  };
}

function mergeCheckResults({
  current,
  updated,
}: {
  current: SolutionCheckResult[];
  updated: SolutionCheckResult[];
}): SolutionCheckResults {
  const byKey = new Map(updated.map((result) => [result.key, result]));
  return {
    results: current.map((result) => byKey.get(result.key) ?? result),
  };
}

function toggleAcknowledged({
  acknowledged,
  key,
  checked,
}: {
  acknowledged: string[];
  key: string;
  checked: boolean;
}): string[] {
  const without = acknowledged.filter((item) => item !== key);
  return checked ? [...without, key] : without;
}

function checkMessage(message: string | null | undefined): string | null {
  switch (message) {
    case 'noConnectionSelected':
      return t('No connection is selected for this system');
    case 'connectionMissing':
      return t('The selected connection no longer exists');
    case 'connectionNotInProject':
      return t('The selected connection is not available in this project');
    case 'connectionNotWorking':
      return t('The selected connection is not working. Reconnect it');
    case 'solutionNotInstalled':
      return t('solutionDependencyNotInstalled');
    default:
      return null;
  }
}

function sortForCenter({
  solutions,
  byInstalls,
}: {
  solutions: SolutionSummary[];
  byInstalls: boolean;
}): SolutionSummary[] {
  const updatedTime = (solution: SolutionSummary) =>
    new Date(solution.updated).getTime();
  return [...solutions].sort((a, b) => {
    const byCount = byInstalls ? b.installCount - a.installCount : 0;
    return byCount !== 0 ? byCount : updatedTime(b) - updatedTime(a);
  });
}

function isConfigRequired(item: SolutionConfigItem): boolean {
  return item.type === SolutionConfigType.TEXT && item.required !== false;
}

function splitChecks<T extends { afterInstall?: boolean }>(
  checks: T[],
): { beforeInstall: T[]; afterInstall: T[] } {
  return {
    beforeInstall: checks.filter((check) => check.afterInstall !== true),
    afterInstall: checks.filter((check) => check.afterInstall === true),
  };
}

function joinLabels(labels: string[]): string {
  return labels.join(t('listSeparator'));
}

function capacityMessage({
  workflowLimit,
  currentWorkflowCount,
  needed,
}: {
  workflowLimit: number | null | undefined;
  currentWorkflowCount: number;
  needed: number;
}): string {
  return t(
    'Installing needs {needed} workflow slots but this project has {left} left ({current} of {limit} used)',
    {
      needed,
      left: Math.max(0, (workflowLimit ?? 0) - currentWorkflowCount),
      current: currentWorkflowCount,
      limit: workflowLimit ?? 0,
    },
  );
}

function workflowNamesOf({
  slot,
  pkg,
}: {
  slot: SolutionConnectionSlot;
  pkg: SolutionPackage;
}): string[] {
  return slot.usedBy.map(
    (key) =>
      pkg.workflows.find((workflow) => workflow.key === key)?.name ?? key,
  );
}

function generatedConnectionCheckConnector(label: string): string | null {
  return label.match(GENERATED_CONNECTION_CHECK_LABEL)?.[1] ?? null;
}

function versionNotesLabel(notes: string): string {
  return notes === FIRST_VERSION_NOTES ? t('First version') : notes;
}

function workflowPath({
  projectId,
  workflowId,
}: {
  projectId: string;
  workflowId: string;
}): string {
  return `/projects/${projectId}/workflows/${workflowId}`;
}

const GENERATED_CONNECTION_CHECK_LABEL = /^Connection for (@\S+) works$/;
const FIRST_VERSION_NOTES = 'First version';

export const WIZARD_STEPS = [
  'project',
  'connections',
  'config',
  'checks',
  'confirm',
] as const;

export const solutionsUtils = {
  categoriesOf,
  categoryLabel,
  filterSolutions,
  isOwn,
  providerLabel,
  hasNewerVersion,
  effectiveConnections,
  missingSlots,
  checkGate,
  toggleAcknowledged,
  mergeCheckResults,
  checkMessage,
  capacityMessage,
  workflowNamesOf,
  generatedConnectionCheckConnector,
  versionNotesLabel,
  workflowPath,
  sortForCenter,
  joinLabels,
  isConfigRequired,
  splitChecks,
};

export type WizardStep = (typeof WIZARD_STEPS)[number];

export type CheckGate = {
  failedBlocking: SolutionCheckResult[];
  needsAcknowledgement: SolutionCheckResult[];
  canContinue: boolean;
};
