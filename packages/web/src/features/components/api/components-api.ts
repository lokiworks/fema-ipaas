import { FlowComponentMetadata } from '@fema-ipaas/component-sdk';
import { t } from 'i18next';

import { api } from '@/lib/api';

export const componentsApi = {
  async list(): Promise<TranslatedComponentMetadata[]> {
    const components = await api.get<FlowComponentMetadata[]>('/v1/components');
    return components.map(translateComponent);
  },
};

function translateComponent(
  component: FlowComponentMetadata,
): TranslatedComponentMetadata {
  const translated = {
    ...structuredClone(component),
    originalText: `${component.displayName} ${component.description} ${component.type}`,
  };
  translated.displayName = translateText(component.displayName);
  translated.description = translateText(component.description);
  for (const prop of Object.values(translated.props)) {
    prop.displayName = translateText(prop.displayName);
    if (prop.description) {
      prop.description = translateText(prop.description);
    }
    if ('options' in prop && hasStaticOptions(prop.options)) {
      for (const option of prop.options.options) {
        option.label = translateText(option.label);
      }
    }
  }
  return translated;
}

function translateText(text: string): string {
  return t(`component: ${text}`, { defaultValue: text });
}

function hasStaticOptions(
  value: unknown,
): value is { options: { label: string; value: unknown }[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'options' in value &&
    Array.isArray(value.options)
  );
}

export type TranslatedComponentMetadata = FlowComponentMetadata & {
  originalText: string;
};
