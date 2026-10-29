import { TranslatedComponentMetadata } from '../api/components-api';

function matches({
  component,
  searchQuery,
}: {
  component: TranslatedComponentMetadata;
  searchQuery: string;
}): boolean {
  const needle = searchQuery.trim().toLowerCase();
  if (needle === '') {
    return true;
  }
  return [
    component.displayName,
    component.description,
    component.originalText,
    ...(SEARCH_ALIASES[component.type] ?? []),
  ]
    .map((text) => text.toLowerCase())
    .some((text) => text.includes(needle));
}

export const componentSearchUtils = { matches };

const SEARCH_ALIASES: Record<string, string[]> = {
  'runtime/http-response': ['webhook', 'return response'],
  'data/mapper': ['data mapper', 'advanced mapping'],
};
