export const textUtils = {
  asText,
  isBlank,
  truncate,
  clamp,
};

function asText(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value) ?? '';
}

function isBlank(value: unknown): boolean {
  return asText(value).trim().length === 0;
}

function truncate({ text, limit }: { text: string; limit: number }): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function clamp({
  value,
  min,
  max,
  fallback,
}: {
  value: number | undefined | null;
  min: number;
  max: number;
  fallback: number;
}): number {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}
