import {
  PropertyExecutionType,
  Template,
  TemplateStatus,
  TemplateType,
  TemplateVisibility,
  WorkflowActionType,
  WorkflowTriggerType,
  WorkflowVersionTemplate,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import {
  TemplateCenterSort,
  TemplateCenterTab,
  templateCenterUtils,
  TemplateStepKind,
} from '@/features/templates/utils/template-center-utils';

const NOW = '2026-09-01T00:00:00.000Z';
const ME = 'user-me';

function workflow(): WorkflowVersionTemplate {
  return {
    displayName: 'Approval notification',
    valid: true,
    schemaVersion: '20',
    trigger: {
      name: 'trigger',
      displayName: 'New approval',
      valid: true,
      lastUpdatedDate: NOW,
      type: WorkflowTriggerType.CONNECTOR,
      settings: {
        connectorName: '@fema-ipaas/connector-feishu',
        connectorVersion: '1.0.0',
        triggerName: 'approval_approved',
        propertySettings: {},
        input: { auth: "{{connections['conn-a']}}", code: 'A-1' },
      },
      nextAction: {
        name: 'step_1',
        displayName: 'Send card',
        valid: true,
        lastUpdatedDate: NOW,
        type: WorkflowActionType.CONNECTOR,
        settings: {
          connectorName: '@fema-ipaas/connector-slack',
          connectorVersion: '1.0.0',
          actionName: 'send_message',
          propertySettings: { text: { type: PropertyExecutionType.MANUAL } },
          input: {
            auth: "{{connections['conn-b']}}",
            text: 'hi {{trigger.name}}',
            token: '{{connections.conn-b.token}}',
          },
          errorHandlingOptions: undefined,
        },
        nextAction: {
          name: 'step_2',
          displayName: 'Format',
          valid: true,
          lastUpdatedDate: NOW,
          type: WorkflowActionType.CODE,
          settings: {
            sourceCode: { code: '', packageJson: '{}' },
            input: {},
            errorHandlingOptions: undefined,
          },
        },
      },
    },
  };
}

function template(overrides: Partial<Template>): Template {
  return {
    id: 'tpl',
    created: NOW,
    updated: NOW,
    name: 'Template',
    type: TemplateType.CUSTOM,
    summary: '',
    description: '',
    tags: [],
    blogUrl: null,
    metadata: null,
    author: 'Lin',
    categories: [],
    connectors: [],
    tenantId: 'tenant-1',
    workflows: [workflow()],
    status: TemplateStatus.PUBLISHED,
    createdBy: null,
    visibility: null,
    usageCount: 0,
    featured: false,
    ...overrides,
  };
}

const official = template({
  id: 'official',
  type: TemplateType.OFFICIAL,
  tenantId: null,
  name: 'Approval to IM',
  categories: ['Approval'],
  usageCount: 50,
  featured: true,
  created: '2026-01-01T00:00:00.000Z',
});
const curated = template({
  id: 'curated',
  name: 'Daily sales report',
  description: 'Summarize opportunities every day',
  categories: ['Reports'],
  usageCount: 5,
  created: '2026-08-01T00:00:00.000Z',
});
const mine = template({
  id: 'mine',
  name: 'My flow',
  createdBy: ME,
  visibility: TemplateVisibility.PRIVATE,
  categories: ['Approval'],
});
const shared = template({
  id: 'shared',
  name: 'Colleague flow',
  createdBy: 'user-other',
  visibility: TemplateVisibility.TENANT,
});
const all = [official, curated, mine, shared];

describe('templateCenterUtils.tabOf', () => {
  it('puts templates without a creator in recommended', () => {
    expect(templateCenterUtils.tabOf({ template: official, userId: ME })).toBe(
      TemplateCenterTab.RECOMMENDED,
    );
    expect(templateCenterUtils.tabOf({ template: curated, userId: ME })).toBe(
      TemplateCenterTab.RECOMMENDED,
    );
  });

  it('splits user templates into mine and shared by creator', () => {
    expect(templateCenterUtils.tabOf({ template: mine, userId: ME })).toBe(
      TemplateCenterTab.MINE,
    );
    expect(templateCenterUtils.tabOf({ template: shared, userId: ME })).toBe(
      TemplateCenterTab.SHARED,
    );
    expect(templateCenterUtils.tabOf({ template: mine, userId: null })).toBe(
      TemplateCenterTab.SHARED,
    );
  });

  it('counts every tab', () => {
    expect(
      templateCenterUtils.countByTab({ templates: all, userId: ME }),
    ).toEqual({
      [TemplateCenterTab.RECOMMENDED]: 2,
      [TemplateCenterTab.MINE]: 1,
      [TemplateCenterTab.SHARED]: 1,
    });
  });
});

describe('templateCenterUtils.listFor', () => {
  const base = {
    templates: all,
    userId: ME,
    tab: TemplateCenterTab.RECOMMENDED,
    category: null,
    search: '',
    sort: TemplateCenterSort.HOT,
  };

  it('sorts by usage for hot and by creation time for new', () => {
    expect(templateCenterUtils.listFor(base).map((item) => item.id)).toEqual([
      'official',
      'curated',
    ]);
    expect(
      templateCenterUtils
        .listFor({ ...base, sort: TemplateCenterSort.NEW })
        .map((item) => item.id),
    ).toEqual(['curated', 'official']);
  });

  it('filters recommended by category only', () => {
    expect(
      templateCenterUtils
        .listFor({ ...base, category: 'Reports' })
        .map((item) => item.id),
    ).toEqual(['curated']);
    expect(
      templateCenterUtils
        .listFor({ ...base, tab: TemplateCenterTab.MINE, category: 'Reports' })
        .map((item) => item.id),
    ).toEqual(['mine']);
  });

  it('searches name and description case insensitively', () => {
    expect(
      templateCenterUtils
        .listFor({ ...base, search: '  OPPORTUNITIES ' })
        .map((item) => item.id),
    ).toEqual(['curated']);
  });

  it('lists featured recommended templates and recommended categories', () => {
    expect(
      templateCenterUtils
        .featuredOf({
          templates: [...all, template({ ...mine, featured: true })],
          userId: ME,
        })
        .map((item) => item.id),
    ).toEqual(['official']);
    expect(templateCenterUtils.categoriesOf([official, curated])).toEqual([
      'Approval',
      'Reports',
    ]);
  });
});

describe('templateCenterUtils.workflowStepsOf', () => {
  it('returns the trigger and the actions in order', () => {
    const [steps] = templateCenterUtils.workflowStepsOf(official);
    expect(steps.trigger).toEqual({
      name: 'trigger',
      displayName: 'New approval',
      kind: TemplateStepKind.CONNECTOR,
      connectorName: '@fema-ipaas/connector-feishu',
    });
    expect(
      steps.actions.map((step) => [step.kind, step.connectorName]),
    ).toEqual([
      [TemplateStepKind.CONNECTOR, '@fema-ipaas/connector-slack'],
      [TemplateStepKind.CODE, null],
    ]);
  });

  it('lists each connector once, trigger first', () => {
    expect(templateCenterUtils.connectorNamesOf(official)).toEqual([
      '@fema-ipaas/connector-feishu',
      '@fema-ipaas/connector-slack',
    ]);
    expect(
      templateCenterUtils.connectorNamesOf(
        template({ workflows: [], connectors: ['a', 'b'] }),
      ),
    ).toEqual(['a', 'b']);
  });
});

describe('templateCenterUtils.stripTemplateConnections', () => {
  it('removes every connection reference and keeps other inputs', () => {
    const stripped = templateCenterUtils.stripTemplateConnections(official);
    const [trigger, action] = workflowStructureUtil.getAllSteps(
      stripped.workflows?.[0].trigger ?? workflow().trigger,
    );
    expect(trigger.settings.input).toEqual({ code: 'A-1' });
    expect(action.settings.input).toEqual({ text: 'hi {{trigger.name}}' });
  });

  it('leaves the original template untouched', () => {
    templateCenterUtils.stripTemplateConnections(official);
    expect(official.workflows?.[0].trigger.settings.input.auth).toBe(
      "{{connections['conn-a']}}",
    );
  });
});
