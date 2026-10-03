import { isNil, Permission } from '@fema-ipaas/core-utils';
import {
  PopulatedWorkflow,
  Step,
  WorkflowActionType,
  WorkflowStatus,
  WorkflowTrigger,
  WorkflowVersionState,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ArrowLeft, Monitor, ScrollText } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { ImageWithColorBackground } from '@/components/custom/image-with-color-background';
import { useEmbedding } from '@/components/providers/embed-provider';
import { buttonVariants } from '@/components/ui/button';
import { stepsHooks } from '@/features/connectors';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { cn } from '@/lib/utils';

const MobileBuilderNotice = ({ workflow }: { workflow: PopulatedWorkflow }) => {
  const { embedState } = useEmbedding();
  const { checkAccess } = useAuthorization();
  const entries = useMemo(
    () => buildStepEntries({ trigger: workflow.version.trigger }),
    [workflow.version.trigger],
  );
  const versionLabel = findVersionLabel({ workflow });
  const showNavigation = !embedState.disableNavigationInBuilder;
  const showRunLogs = showNavigation && checkAccess(Permission.READ_RUN);

  return (
    <div className="bg-background flex h-full w-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold break-words">
          {workflow.version.displayName}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {!isNil(versionLabel) && <StatusTag>{versionLabel}</StatusTag>}
          <StatusTag>
            {workflow.status === WorkflowStatus.ENABLED
              ? t('Enabled')
              : t('Disabled')}
          </StatusTag>
        </div>
      </div>

      <div className="bg-muted/50 flex items-start gap-3 rounded-lg border p-3">
        <Monitor className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">
            {t('Please edit on a computer')}
          </p>
          <p className="text-muted-foreground text-sm">
            {t(
              'The workflow editor needs a wider screen. Open this page on a computer to edit. On this device you can review the steps and check run logs.',
            )}
          </p>
        </div>
      </div>

      {showNavigation && (
        <div className="flex flex-col gap-2">
          <Link
            className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
            to={`/projects/${workflow.projectId}/automations`}
          >
            <ArrowLeft />
            {t('Back to workflows')}
          </Link>
          {showRunLogs && (
            <Link
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
              to={`/projects/${workflow.projectId}/runs?workflowId=${workflow.id}`}
            >
              <ScrollText />
              {t("View this workflow's run logs")}
            </Link>
          )}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          {t('Steps ({count})', { count: entries.length })}
        </h2>
        <ol className="flex flex-col gap-2">
          {entries.map((entry) => (
            <StepRow key={entry.step.name} entry={entry} />
          ))}
        </ol>
      </section>
    </div>
  );
};

const StepRow = ({ entry }: { entry: StepEntry }) => {
  const { step, number, depth, branchLabel } = entry;
  const { stepMetadata } = stepsHooks.useStepMetadata({ step });
  const indentDepth = Math.min(depth, MAX_VISIBLE_INDENT_DEPTH);

  return (
    <li
      data-depth={depth}
      className={cn('flex items-center gap-3 rounded-lg border p-2.5', {
        'border-s-2 border-s-primary/40': depth > 0,
      })}
      style={{ marginInlineStart: indentDepth * INDENT_STEP_PX }}
    >
      <ImageWithColorBackground
        src={stepMetadata?.logoUrl ?? ''}
        alt={stepMetadata?.displayName ?? ''}
        border={true}
        roundedCorner={true}
        className="size-9 shrink-0 p-2"
      />
      <div className="flex min-w-0 flex-col">
        {!isNil(branchLabel) && (
          <span className="text-muted-foreground text-xs break-words">
            {t('Branch: {name}', { name: branchLabel })}
          </span>
        )}
        <span className="text-sm break-words">
          {number}. {step.displayName}
        </span>
        {!isNil(stepMetadata) && (
          <span className="text-muted-foreground text-xs break-words">
            {stepMetadata.displayName}
          </span>
        )}
      </div>
    </li>
  );
};

const StatusTag = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap">
    {children}
  </span>
);

function buildStepEntries({ trigger }: { trigger: WorkflowTrigger }) {
  const steps = workflowStructureUtil.getAllSteps(trigger);
  const descendantNames = steps.map((step) => ({
    name: step.name,
    descendants: new Set(
      workflowStructureUtil
        .getAllChildSteps(step)
        .map((child) => child.name)
        .filter((childName) => childName !== step.name),
    ),
  }));
  const branchLabels = collectBranchLabels({ steps });
  return steps.map((step, index): StepEntry => {
    return {
      step,
      number: index + 1,
      depth: descendantNames.filter((candidate) =>
        candidate.descendants.has(step.name),
      ).length,
      branchLabel: branchLabels[step.name],
    };
  });
}

function collectBranchLabels({
  steps,
}: {
  steps: Step[];
}): Record<string, string | undefined> {
  const pairs = steps.flatMap((step) => {
    if (
      step.type !== WorkflowActionType.ROUTER &&
      step.type !== WorkflowActionType.PARALLEL
    ) {
      return [];
    }
    return step.children.flatMap((child, index) =>
      isNil(child)
        ? []
        : [[child.name, step.settings.branches[index]?.branchName]],
    );
  });
  return Object.fromEntries(pairs);
}

function findVersionLabel({
  workflow,
}: {
  workflow: PopulatedWorkflow;
}): string | null {
  if (workflow.version.state === WorkflowVersionState.DRAFT) {
    return t('Draft');
  }
  if (workflow.publishedVersionId === workflow.version.id) {
    return t('Published');
  }
  return null;
}

const MAX_VISIBLE_INDENT_DEPTH = 4;
const INDENT_STEP_PX = 14;

type StepEntry = {
  step: Step;
  number: number;
  depth: number;
  branchLabel: string | undefined;
};

export { MobileBuilderNotice };
