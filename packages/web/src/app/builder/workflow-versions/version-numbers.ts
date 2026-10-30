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

function shownAt({
  version,
  publishedAt,
}: {
  version: DatedVersion;
  publishedAt: string | null | undefined;
}): string {
  if (version.state === WorkflowVersionState.DRAFT) {
    return version.updated;
  }
  return publishedAt ?? version.created;
}

export const versionNumbers = {
  numberVersions,
  label,
  shownAt,
};

type VersionLike = {
  id: string;
  created: string;
  state: WorkflowVersionState;
};

type DatedVersion = VersionLike & {
  updated: string;
};
