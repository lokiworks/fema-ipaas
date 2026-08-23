import { WorkflowVersionTemplate, Template } from '@fema/shared';

export const templateUtils = {
  parseTemplate: (jsonString: string): Template | null => {
    try {
      const parsed = JSON.parse(jsonString);
      let template: Template;

      if (
        parsed.workflows &&
        Array.isArray(parsed.workflows) &&
        parsed.workflows.length > 0
      ) {
        template = parsed as Template;
      } else if (parsed.template && parsed.name) {
        template = {
          ...parsed,
          workflows: [parsed.template],
        } as Template;
        delete (template as any).template;
      } else {
        return null;
      }

      const { workflows, name } = template;
      if (!workflows?.[0] || !name || !workflows[0].trigger) {
        return null;
      }

      return template;
    } catch {
      return null;
    }
  },

  extractWorkflow: (jsonString: string): WorkflowVersionTemplate | null => {
    try {
      const parsed = JSON.parse(jsonString);

      if (
        parsed.workflows &&
        Array.isArray(parsed.workflows) &&
        parsed.workflows.length > 0
      ) {
        return parsed.workflows[0] as WorkflowVersionTemplate;
      } else if (parsed.template) {
        return parsed.template as WorkflowVersionTemplate;
      }

      return null;
    } catch {
      return null;
    }
  },
};
