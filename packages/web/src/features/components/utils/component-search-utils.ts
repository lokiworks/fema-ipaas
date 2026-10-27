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
  return [component.displayName, component.description, component.originalText]
    .map((text) => text.toLowerCase())
    .some((text) => text.includes(needle));
}

export const componentSearchUtils = { matches };
