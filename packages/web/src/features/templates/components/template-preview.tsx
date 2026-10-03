import { ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import { Template } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  Blocks,
  CircleDashed,
  Code2,
  GitBranch,
  Info,
  LucideIcon,
  Repeat,
  Rows3,
} from 'lucide-react';
import { useMemo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ConnectorIcon, connectorsHooks } from '@/features/connectors';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';

import {
  TemplateCenterTab,
  templateCenterUtils,
  TemplateStepKind,
  TemplateStepSummary,
  TemplateWorkflowSteps,
} from '../utils/template-center-utils';

import { TemplateConnectorChain } from './template-connector-chain';

export function TemplatePreview({ template }: { template: Template }) {
  const connectorNames = useMemo(
    () => templateCenterUtils.connectorNamesOf(template),
    [template],
  );
  const { summaries, isLoading } = connectorsHooks.useConnectorSummariesByNames(
    {
      names: connectorNames,
    },
  );
  const summaryByName = useMemo(
    () => new Map(summaries.map((summary) => [summary.name, summary])),
    [summaries],
  );
  const workflows = templateCenterUtils.workflowStepsOf(template);
  const needsConnection = summaries.filter(requiresConnection);
  const connectionsKnown =
    !isLoading && summaries.length === connectorNames.length;
  const official =
    templateCenterUtils.tabOf({
      template,
      userId: authenticationSession.getCurrentUserId(),
    }) === TemplateCenterTab.RECOMMENDED;
  const origin = official
    ? t('Official template')
    : t('Created by {name}', { name: template.author });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <TemplateConnectorChain template={template} size="md" />
        <h2 className="text-lg font-semibold">{template.name}</h2>
        <p className="text-sm text-muted-foreground">
          {template.description || template.summary || t('No description')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {template.categories.map((category) => (
            <Badge key={category} variant="outline">
              {category}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground">
            {[
              t('{count} uses', { count: template.usageCount ?? 0 }),
              origin,
              formatUtils.formatDateOnly(new Date(template.created)),
            ].join(' · ')}
          </span>
        </div>
      </div>

      {workflows.map((workflow, index) => (
        <WorkflowSteps
          key={`${index}-${workflow.displayName}`}
          workflow={workflow}
          showTitle={workflows.length > 1}
          summaryByName={summaryByName}
        />
      ))}

      <Alert variant="primary">
        <Info />
        <AlertTitle>{t('Prepare before using')}</AlertTitle>
        <AlertDescription>
          {needsConnection.length > 0
            ? t('Connections to {names}.', {
                names: needsConnection
                  .map((summary) => summary.displayName)
                  .join(t('listSeparator')),
              })
            : connectionsKnown
            ? t('This template needs no connection.')
            : ''}{' '}
          {t(
            'After you use the template, the validation panel in the editor lists the settings to complete.',
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}

function WorkflowSteps({
  workflow,
  showTitle,
  summaryByName,
}: {
  workflow: TemplateWorkflowSteps;
  showTitle: boolean;
  summaryByName: Map<string, ConnectorMetadataModelSummary>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {showTitle && (
        <span className="text-sm font-medium">{workflow.displayName}</span>
      )}
      <span className="text-xs font-medium text-muted-foreground">
        {t('When this event happens')}
      </span>
      <StepRow step={workflow.trigger} summaryByName={summaryByName} />
      <span className="text-xs font-medium text-muted-foreground">
        {t('Run these steps')}
      </span>
      {workflow.actions.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          {t(
            'This template has no preset steps. Add them in the editor after using it.',
          )}
        </span>
      ) : (
        workflow.actions.map((step, index) => (
          <StepRow
            key={step.name}
            step={step}
            number={index + 1}
            summaryByName={summaryByName}
          />
        ))
      )}
    </div>
  );
}

function StepRow({
  step,
  number,
  summaryByName,
}: {
  step: TemplateStepSummary;
  number?: number;
  summaryByName: Map<string, ConnectorMetadataModelSummary>;
}) {
  const summary = isNil(step.connectorName)
    ? undefined
    : summaryByName.get(step.connectorName);
  const StepIcon = STEP_KIND_ICONS[step.kind];
  const title =
    step.kind === TemplateStepKind.CONNECTOR
      ? summary?.displayName ?? t('Connector unavailable')
      : step.displayName;
  const subtitle =
    step.kind === TemplateStepKind.CONNECTOR
      ? step.displayName
      : t(STEP_KIND_LABELS[step.kind]);
  return (
    <div className="flex min-w-0 items-center gap-3">
      {!isNil(number) && (
        <span className="w-4 shrink-0 text-xs text-muted-foreground">
          {number}
        </span>
      )}
      {step.kind === TemplateStepKind.CONNECTOR ? (
        <ConnectorIcon
          size="sm"
          border={true}
          displayName={summary?.displayName}
          logoUrl={summary?.logoUrl}
          showTooltip={false}
        />
      ) : (
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-md border">
          <StepIcon className="size-4 text-muted-foreground" />
        </span>
      )}
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      </div>
    </div>
  );
}

function requiresConnection(summary: ConnectorMetadataModelSummary): boolean {
  if (Array.isArray(summary.auth)) {
    return summary.auth.length > 0;
  }
  return !isNil(summary.auth);
}

const STEP_KIND_ICONS: Record<TemplateStepKind, LucideIcon> = {
  [TemplateStepKind.CONNECTOR]: Blocks,
  [TemplateStepKind.EMPTY]: CircleDashed,
  [TemplateStepKind.CODE]: Code2,
  [TemplateStepKind.COMPONENT]: Blocks,
  [TemplateStepKind.LOOP]: Repeat,
  [TemplateStepKind.PARALLEL]: Rows3,
  [TemplateStepKind.ROUTER]: GitBranch,
};

const STEP_KIND_LABELS: Record<TemplateStepKind, string> = {
  [TemplateStepKind.CONNECTOR]: 'Connector',
  [TemplateStepKind.EMPTY]: 'Trigger not selected',
  [TemplateStepKind.CODE]: 'Code',
  [TemplateStepKind.COMPONENT]: 'Component',
  [TemplateStepKind.LOOP]: 'Loop',
  [TemplateStepKind.PARALLEL]: 'Parallel',
  [TemplateStepKind.ROUTER]: 'Router',
};
