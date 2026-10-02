import { isNil } from '@fema-ipaas/core-utils';
import {
  ConnectionWithoutSensitiveData,
  Solution,
  SolutionCheckResult,
  SolutionCheckStatus,
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
    (result) => result.blocking && result.status !== SolutionCheckStatus.PASS,
  );
  const needsAcknowledgement = results.filter(
    (result) => !result.blocking && result.status !== SolutionCheckStatus.PASS,
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
    default:
      return null;
  }
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

function workflowPath({
  projectId,
  workflowId,
}: {
  projectId: string;
  workflowId: string;
}): string {
  return `/projects/${projectId}/workflows/${workflowId}`;
}

export const WIZARD_STEPS = [
  'project',
  'connections',
  'config',
  'checks',
  'confirm',
] as const;

export const solutionsUtils = {
  categoriesOf,
  filterSolutions,
  isOwn,
  providerLabel,
  hasNewerVersion,
  effectiveConnections,
  missingSlots,
  checkGate,
  toggleAcknowledged,
  checkMessage,
  capacityMessage,
  workflowNamesOf,
  workflowPath,
};

export type WizardStep = (typeof WIZARD_STEPS)[number];

export type CheckGate = {
  failedBlocking: SolutionCheckResult[];
  needsAcknowledgement: SolutionCheckResult[];
  canContinue: boolean;
};
