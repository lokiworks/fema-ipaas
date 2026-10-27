import { FlowComponentMetadata } from '@fema-ipaas/component-sdk';

import { api } from '@/lib/api';

import { componentTranslation } from '../utils/component-translation';

export const componentsApi = {
  async list(): Promise<TranslatedComponentMetadata[]> {
    const components = await api.get<FlowComponentMetadata[]>('/v1/components');
    return components.map(translateComponent);
  },
};

function translateComponent(
  component: FlowComponentMetadata,
): TranslatedComponentMetadata {
  return {
    ...component,
    originalText: `${component.displayName} ${component.description} ${component.type}`,
    displayName: componentTranslation.translateText({
      text: component.displayName,
    }),
    description: componentTranslation.translateText({
      text: component.description,
    }),
    props: componentTranslation.translateProps({ props: component.props }),
  };
}

export type TranslatedComponentMetadata = FlowComponentMetadata & {
  originalText: string;
};
