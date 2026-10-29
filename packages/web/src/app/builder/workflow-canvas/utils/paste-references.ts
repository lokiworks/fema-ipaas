import { extractMustacheTokens, isNil } from '@fema-ipaas/core-utils';
import {
  Step,
  WorkflowAction,
  WorkflowOperationRequest,
  WorkflowOperationType,
  workflowOperations,
  workflowReferenceUtil,
  workflowStructureUtil,
  WorkflowVersion,
} from '@fema-ipaas/shared';

import { workflowValidator } from '@/features/workflows/utils/workflow-validator';

function clearMissingBeforePaste({
  actions,
  workflowVersion,
}: {
  actions: WorkflowAction[];
  workflowVersion: WorkflowVersion;
}): { actions: WorkflowAction[]; clearedCount: number } {
  const pastedNames = new Set(
    actions.flatMap((action) =>
      workflowStructureUtil.getAllSteps(action).map((step) => step.name),
    ),
  );
  const existingNames = new Set(
    workflowStructureUtil
      .getAllSteps(workflowVersion.trigger)
      .map((step) => step.name),
  );
  const isMissing = (root: string) =>
    !pastedNames.has(root) &&
    !existingNames.has(root) &&
    looksLikeStep({ root, stepNames: existingNames });
  const results = actions.map((action) => {
    const cloned: WorkflowAction = JSON.parse(JSON.stringify(action));
    const counts = workflowStructureUtil
      .getAllSteps(cloned)
      .map((step) => clearInStep({ step, isBroken: isMissing }));
    return {
      action: cloned,
      clearedCount: counts.reduce((sum, count) => sum + count, 0),
    };
  });
  return {
    actions: results.map((result) => result.action),
    clearedCount: results.reduce((sum, result) => sum + result.clearedCount, 0),
  };
}

function clearNonUpstreamAfterPaste({
  operations,
  workflowVersion,
}: {
  operations: WorkflowOperationRequest[];
  workflowVersion: WorkflowVersion;
}): { operations: WorkflowOperationRequest[]; clearedCount: number } {
  const pasted = operations.reduce(
    (version, operation) => workflowOperations.apply(version, operation),
    workflowVersion,
  );
  const stepNames = new Set(
    workflowStructureUtil.getAllSteps(pasted.trigger).map((step) => step.name),
  );
  const upstreamByStep = new Map(
    workflowValidator
      .collectSteps(pasted.trigger)
      .map((entry) => [entry.step.name, new Set(entry.upstream)]),
  );
  const results = operations.map((operation) => {
    if (operation.type !== WorkflowOperationType.ADD_ACTION) {
      return { operation, clearedCount: 0 };
    }
    const upstream =
      upstreamByStep.get(operation.request.action.name) ?? new Set<string>();
    const action: WorkflowAction = JSON.parse(
      JSON.stringify(operation.request.action),
    );
    const clearedCount = clearInStep({
      step: action,
      isBroken: (root) =>
        !upstream.has(root) && looksLikeStep({ root, stepNames }),
    });
    return {
      operation: {
        ...operation,
        request: { ...operation.request, action },
      },
      clearedCount,
    };
  });
  return {
    operations: results.map((result) => result.operation),
    clearedCount: results.reduce((sum, result) => sum + result.clearedCount, 0),
  };
}

function clearInStep({
  step,
  isBroken,
}: {
  step: Step;
  isBroken: (root: string) => boolean;
}): number {
  const settings: Record<string, unknown> = step.settings;
  const results = REFERENCE_SETTINGS.filter((key) => key in settings).map(
    (key) => {
      const cleared = clearInValue({ value: settings[key], isBroken });
      settings[key] = cleared.value;
      return cleared.clearedCount;
    },
  );
  const clearedCount = results.reduce((sum, count) => sum + count, 0);
  if (clearedCount > 0) {
    step.valid = false;
  }
  return clearedCount;
}

function clearInValue({
  value,
  isBroken,
}: {
  value: unknown;
  isBroken: (root: string) => boolean;
}): { value: unknown; clearedCount: number } {
  if (typeof value === 'string') {
    const brokenTokens = extractMustacheTokens(value)
      .map((token) => token.token)
      .filter((token) =>
        workflowReferenceUtil
          .extractFromValue(token)
          .some((reference) => isBroken(reference.root)),
      );
    return {
      value: brokenTokens.reduce(
        (text, token) => text.split(token).join(''),
        value,
      ),
      clearedCount: brokenTokens.length,
    };
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => clearInValue({ value: item, isBroken }));
    return {
      value: items.map((item) => item.value),
      clearedCount: items.reduce((sum, item) => sum + item.clearedCount, 0),
    };
  }
  if (typeof value === 'object' && !isNil(value)) {
    const entries = Object.entries(value).map(([key, entry]) => ({
      key,
      ...clearInValue({ value: entry, isBroken }),
    }));
    return {
      value: Object.fromEntries(
        entries.map((entry) => [entry.key, entry.value]),
      ),
      clearedCount: entries.reduce((sum, entry) => sum + entry.clearedCount, 0),
    };
  }
  return { value, clearedCount: 0 };
}

function looksLikeStep({
  root,
  stepNames,
}: {
  root: string;
  stepNames: Set<string>;
}): boolean {
  return stepNames.has(root) || STEP_NAME_PATTERN.test(root);
}

export const pasteReferences = {
  clearMissingBeforePaste,
  clearNonUpstreamAfterPaste,
};

const REFERENCE_SETTINGS = ['input', 'items', 'branches'];
const STEP_NAME_PATTERN = /^(trigger|step_\d+)$/;
