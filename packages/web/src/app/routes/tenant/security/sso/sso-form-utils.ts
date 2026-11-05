function paramsToRows(
  params: Record<string, string>,
): { key: string; value: string }[] {
  return Object.entries(params).map(([key, value]) => ({ key, value }));
}

function rowsToParams(
  rows: { key: string; value: string }[],
): Record<string, string> {
  return Object.fromEntries(
    rows
      .map((row) => ({ key: row.key.trim(), value: row.value }))
      .filter((row) => row.key.length > 0)
      .map((row) => [row.key, row.value]),
  );
}

function parseRecheck(text: string): number | null {
  const value = text.trim();
  return /^\d+$/.test(value) ? Number(value) : null;
}

function recheckError(text: string): string | null {
  const value = text.trim();
  if (value.length === 0) {
    return null;
  }
  const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return parsed >= 5 && parsed <= 1440 ? null : 'ssoRecheckRange';
}

export const ssoFormUtils = {
  paramsToRows,
  rowsToParams,
  parseRecheck,
  recheckError,
};
