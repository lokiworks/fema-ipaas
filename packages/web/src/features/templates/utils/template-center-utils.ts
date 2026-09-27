import { isNil } from '@fema-ipaas/core-utils';
import {
  Step,
  Template,
  templateConnectionUtils,
  WorkflowActionType,
  workflowStructureUtil,
  WorkflowTriggerType,
  WorkflowVersionTemplate,
} from '@fema-ipaas/shared';

function tabOf({
  template,
  userId,
}: {
  template: Pick<Template, 'createdBy'>;
  userId: string | null;
}): TemplateCenterTab {
  if (isNil(template.createdBy)) {
    return TemplateCenterTab.RECOMMENDED;
  }
  return template.createdBy === userId
    ? TemplateCenterTab.MINE
    : TemplateCenterTab.SHARED;
}

function countByTab({
  templates,
  userId,
}: {
  templates: Template[];
  userId: string | null;
}): Record<TemplateCenterTab, number> {
  return templates.reduce<Record<TemplateCenterTab, number>>(
    (counts, template) => {
      const tab = tabOf({ template, userId });
      return { ...counts, [tab]: counts[tab] + 1 };
    },
    {
      [TemplateCenterTab.RECOMMENDED]: 0,
      [TemplateCenterTab.MINE]: 0,
      [TemplateCenterTab.SHARED]: 0,
    },
  );
}

function categoriesOf(templates: Template[]): string[] {
  return Array.from(
    new Set(
      templates.flatMap((template) =>
        template.categories.filter((category) => category.trim() !== ''),
      ),
    ),
  );
}

function matchesSearch({
  template,
  search,
}: {
  template: Template;
  search: string;
}): boolean {
  const query = search.trim().toLowerCase();
  if (query === '') {
    return true;
  }
  return [template.name, template.summary, template.description]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

function sortTemplates({
  templates,
  sort,
}: {
  templates: Template[];
  sort: TemplateCenterSort;
}): Template[] {
  const createdTime = (template: Template) =>
    new Date(template.created).getTime();
  return [...templates].sort((a, b) => {
    if (sort === TemplateCenterSort.HOT) {
      const byUsage = (b.usageCount ?? 0) - (a.usageCount ?? 0);
      if (byUsage !== 0) {
        return byUsage;
      }
    }
    return createdTime(b) - createdTime(a);
  });
}

function listFor({
  templates,
  userId,
  tab,
  category,
  search,
  sort,
}: {
  templates: Template[];
  userId: string | null;
  tab: TemplateCenterTab;
  category: string | null;
  search: string;
  sort: TemplateCenterSort;
}): Template[] {
  const filtered = templates
    .filter((template) => tabOf({ template, userId }) === tab)
    .filter(
      (template) =>
        tab !== TemplateCenterTab.RECOMMENDED ||
        isNil(category) ||
        template.categories.includes(category),
    )
    .filter((template) => matchesSearch({ template, search }));
  return sortTemplates({ templates: filtered, sort });
}

function featuredOf({
  templates,
  userId,
}: {
  templates: Template[];
  userId: string | null;
}): Template[] {
  return sortTemplates({
    templates: templates.filter(
      (template) =>
        template.featured === true &&
        tabOf({ template, userId }) === TemplateCenterTab.RECOMMENDED,
    ),
    sort: TemplateCenterSort.HOT,
  });
}

function stepKindOf(step: Step): TemplateStepKind {
  switch (step.type) {
    case WorkflowTriggerType.CONNECTOR:
    case WorkflowActionType.CONNECTOR:
      return TemplateStepKind.CONNECTOR;
    case WorkflowTriggerType.EMPTY:
      return TemplateStepKind.EMPTY;
    case WorkflowActionType.CODE:
      return TemplateStepKind.CODE;
    case WorkflowActionType.COMPONENT:
      return TemplateStepKind.COMPONENT;
    case WorkflowActionType.LOOP_ON_ITEMS:
      return TemplateStepKind.LOOP;
    case WorkflowActionType.PARALLEL:
      return TemplateStepKind.PARALLEL;
    case WorkflowActionType.ROUTER:
      return TemplateStepKind.ROUTER;
  }
}

function toStepSummary(step: Step): TemplateStepSummary {
  const kind = stepKindOf(step);
  return {
    name: step.name,
    displayName: step.displayName,
    kind,
    connectorName:
      step.type === WorkflowTriggerType.CONNECTOR ||
      step.type === WorkflowActionType.CONNECTOR
        ? step.settings.connectorName
        : null,
  };
}

function stepsOf(workflow: WorkflowVersionTemplate): TemplateWorkflowSteps {
  const [trigger, ...actions] = workflowStructureUtil.getAllSteps(
    workflow.trigger,
  );
  return {
    displayName: workflow.displayName,
    trigger: toStepSummary(trigger),
    actions: actions.map(toStepSummary),
  };
}

function workflowStepsOf(template: Template): TemplateWorkflowSteps[] {
  return (template.workflows ?? []).map(stepsOf);
}

function connectorNamesOf(template: Template): string[] {
  const fromWorkflows = workflowStepsOf(template).flatMap((workflow) =>
    [workflow.trigger, ...workflow.actions]
      .map((step) => step.connectorName)
      .filter((name): name is string => !isNil(name)),
  );
  return Array.from(
    new Set(fromWorkflows.length > 0 ? fromWorkflows : template.connectors),
  );
}

function stripTemplateConnections(template: Template): Template {
  return {
    ...template,
    workflows: template.workflows?.map((workflow) => ({
      ...workflow,
      trigger: templateConnectionUtils.stripTrigger(workflow.trigger),
    })),
  };
}

export const templateCenterUtils = {
  tabOf,
  countByTab,
  categoriesOf,
  matchesSearch,
  sortTemplates,
  listFor,
  featuredOf,
  workflowStepsOf,
  connectorNamesOf,
  stripTemplateConnections,
};

export enum TemplateCenterTab {
  RECOMMENDED = 'recommended',
  MINE = 'mine',
  SHARED = 'shared',
}

export enum TemplateCenterSort {
  HOT = 'hot',
  NEW = 'new',
}

export enum TemplateStepKind {
  CONNECTOR = 'connector',
  EMPTY = 'empty',
  CODE = 'code',
  COMPONENT = 'component',
  LOOP = 'loop',
  PARALLEL = 'parallel',
  ROUTER = 'router',
}

export type TemplateStepSummary = {
  name: string;
  displayName: string;
  kind: TemplateStepKind;
  connectorName: string | null;
};

export type TemplateWorkflowSteps = {
  displayName: string;
  trigger: TemplateStepSummary;
  actions: TemplateStepSummary[];
};
