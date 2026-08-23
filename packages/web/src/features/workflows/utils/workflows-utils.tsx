import {
  PopulatedWorkflow,
  WorkflowTriggerType,
  TriggerSourceScheduleType,
} from '@fema/shared';
import cronstrue from 'cronstrue/i18n';
import { t } from 'i18next';
import JSZip from 'jszip';
import { TimerReset, TriangleAlert, Zap } from 'lucide-react';

import { downloadFile } from '@/lib/dom-utils';

import { workflowsApi } from '../api/workflows-api';

const downloadWorkflow = async (workflowId: string) => {
  const template = await workflowsApi.getTemplate(workflowId, {});
  downloadFile({
    obj: JSON.stringify(template, null, 2),
    fileName: template.name,
    extension: 'json',
  });
};

const zipWorkflows = async (workflows: PopulatedWorkflow[]) => {
  const zip = new JSZip();
  for (const workflow of workflows) {
    const template = await workflowsApi.getTemplate(workflow.id, {});
    zip.file(
      `${workflow.version.displayName}_${workflow.id}.json`,
      JSON.stringify(template, null, 2),
    );
  }
  return zip;
};

export const workflowsUtils = {
  downloadWorkflow,
  zipWorkflows,
  workflowStatusToolTipRenderer: (workflow: PopulatedWorkflow) => {
    const trigger = workflow.version.trigger;
    switch (trigger?.type) {
      case WorkflowTriggerType.CONNECTOR: {
        const schedule = workflow.triggerSource?.schedule;
        switch (schedule?.type) {
          case TriggerSourceScheduleType.INTERVAL:
            return t(
              'Run every {minutes, plural, =1 {minute} other {# minutes}}',
              { minutes: Math.round(schedule.intervalMs / 60_000) },
            );
          case TriggerSourceScheduleType.CRON_EXPRESSION:
            return `${t('Run')} ${cronstrue
              .toString(schedule.cronExpression, { locale: 'en' })
              .toLocaleLowerCase()}`;
          default:
            return t('Real time workflow');
        }
      }
      case WorkflowTriggerType.EMPTY:
        console.error(
          t("Workflow can't be published with empty trigger {name}", {
            name: workflow.version.displayName,
          }),
        );
        return t(
          'Please contact support as your published workflow has a problem',
        );
    }
  },
  workflowStatusIconRenderer: (workflow: PopulatedWorkflow) => {
    const trigger = workflow.version.trigger;
    switch (trigger?.type) {
      case WorkflowTriggerType.CONNECTOR: {
        if (workflow.triggerSource?.schedule) {
          return <TimerReset className="h-4 w-4 text-foreground" />;
        } else {
          return <Zap className="h-4 w-4 text-foreground fill-foreground" />;
        }
      }
      case WorkflowTriggerType.EMPTY: {
        console.error(
          t("Workflow can't be published with empty trigger {name}", {
            name: workflow.version.displayName,
          }),
        );
        return <TriangleAlert className="h-4 w-4 text-destructive" />;
      }
    }
  },
};
