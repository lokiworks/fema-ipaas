function toRecord(values: unknown): Record<string, string> | null {
  if (values === null || values === undefined) {
    return {};
  }
  if (typeof values !== 'object' || Array.isArray(values)) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value) ?? '',
    ]),
  );
}

function previewOf(values: unknown): string {
  return typeof values === 'string' ? values : JSON.stringify(values) ?? '';
}

export const dictionaryInputUtils = { toRecord, previewOf };
