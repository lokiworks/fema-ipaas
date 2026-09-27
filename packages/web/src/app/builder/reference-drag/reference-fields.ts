function flatten(value: unknown): ReferenceField[] {
  return walk({ value, path: '', depth: 0 }).slice(0, MAX_FIELDS);
}

function walk({
  value,
  path,
  depth,
}: {
  value: unknown;
  path: string;
  depth: number;
}): ReferenceField[] {
  if (depth > MAX_DEPTH) {
    return [];
  }
  if (Array.isArray(value)) {
    const own = path.length > 0 ? [{ path, preview: preview(value) }] : [];
    return value.length === 0
      ? own
      : [
          ...own,
          ...walk({ value: value[0], path: `${path}[0]`, depth: depth + 1 }),
        ];
  }
  if (typeof value === 'object' && value !== null) {
    const own = path.length > 0 ? [{ path, preview: preview(value) }] : [];
    return [
      ...own,
      ...Object.entries(value).flatMap(([key, child]) =>
        walk({
          value: child,
          path: path.length > 0 ? `${path}.${key}` : key,
          depth: depth + 1,
        }),
      ),
    ];
  }
  return path.length > 0 ? [{ path, preview: preview(value) }] : [];
}

function preview(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  return text.length > PREVIEW_LIMIT
    ? `${text.slice(0, PREVIEW_LIMIT)}…`
    : text;
}

export const referenceFields = {
  flatten,
};

const MAX_DEPTH = 6;
const MAX_FIELDS = 300;
const PREVIEW_LIMIT = 60;

export type ReferenceField = {
  path: string;
  preview: string;
};
