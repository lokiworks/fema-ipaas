import { dataMapping } from '@fema-ipaas/core-utils';

function resolveTemplate({
  template,
  sampleData,
}: {
  template: unknown;
  sampleData: Record<string, unknown>;
}): unknown {
  if (typeof template !== 'string') {
    return template;
  }
  const whole = WHOLE_TEMPLATE.exec(template.trim());
  if (whole) {
    return readReference({ reference: whole[1], sampleData });
  }
  return template.replace(ANY_TEMPLATE, (_match, reference: string) => {
    const value = readReference({ reference, sampleData });
    if (value === undefined || value === null) {
      return '';
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

function readReference({
  reference,
  sampleData,
}: {
  reference: string;
  sampleData: Record<string, unknown>;
}): unknown {
  const [stepName, ...rest] = reference
    .trim()
    .replace(/\['([^']+)'\]/g, '.$1')
    .split('.');
  return dataMapping.readPath({
    root: sampleData[stepName],
    path: rest.join('.'),
  });
}

const WHOLE_TEMPLATE = /^\{\{\s*([^{}]+?)\s*\}\}$/;
const ANY_TEMPLATE = /\{\{\s*([^{}]+?)\s*\}\}/g;

export const templatePreview = {
  resolveTemplate,
};
