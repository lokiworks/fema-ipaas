import { t } from 'i18next';

function translateText({ text }: { text: string }): string {
  return t(`component: ${text}`, { defaultValue: text });
}

function translateProps<
  T extends Record<string, { displayName: string; description?: string }>,
>({ props }: { props: T }): T {
  const translated = structuredClone(props);
  for (const prop of Object.values(translated)) {
    prop.displayName = translateText({ text: prop.displayName });
    if (prop.description) {
      prop.description = translateText({ text: prop.description });
    }
    if ('options' in prop && hasStaticOptions(prop.options)) {
      for (const option of prop.options.options) {
        option.label = translateText({ text: option.label });
      }
    }
  }
  return translated;
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

export const componentTranslation = { translateText, translateProps };
