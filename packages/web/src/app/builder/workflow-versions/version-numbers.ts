import { WorkflowVersionState } from '@fema-ipaas/shared';

function numberVersions(versions: VersionLike[]): Record<string, number> {
  const locked = versions
    .filter((version) => version.state === WorkflowVersionState.LOCKED)
    .sort(
      (a, b) =>
        new Date(a.created).getTime() - new Date(b.created).getTime() ||
        a.id.localeCompare(b.id),
    );
  return Object.fromEntries(
    locked.map((version, index) => [version.id, index + 1]),
  );
}

function label({
  numbers,
  versionId,
}: {
  numbers: Record<string, number>;
  versionId: string | null | undefined;
}): string | null {
  if (!versionId) {
    return null;
  }
  const value = numbers[versionId];
  return value ? `v${value}` : null;
}

export const versionNumbers = {
  numberVersions,
  label,
};

type VersionLike = {
  id: string;
  created: string;
  state: WorkflowVersionState;
};
