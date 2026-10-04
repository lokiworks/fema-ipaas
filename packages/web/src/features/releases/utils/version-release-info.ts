import {
  ReleaseChangeAction,
  ReleaseChangeWithDetails,
} from '@fema-ipaas/shared';

function byVersion(
  changes: ReleaseChangeWithDetails[],
): Record<string, VersionReleaseInfo> {
  const requesters = new Map(
    changes
      .filter((change) => change.action === ReleaseChangeAction.REQUESTED)
      .map((change) => [change.releaseId, change.actorName]),
  );
  const ordered = [...changes].sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
  );
  return ordered.reduce<Record<string, VersionReleaseInfo>>((info, change) => {
    const versionId = change.toVersionId;
    if (!versionId) {
      return info;
    }
    const current = info[versionId] ?? {
      production: null,
      test: null,
      requestedBy: null,
    };
    if (change.action === ReleaseChangeAction.DEPLOYED_TO_TEST) {
      return {
        ...info,
        [versionId]: { ...current, test: current.test ?? change },
      };
    }
    if (PRODUCTION_ACTIONS.includes(change.action)) {
      return {
        ...info,
        [versionId]: {
          ...current,
          production: current.production ?? change,
          requestedBy:
            current.production === null
              ? requesters.get(change.releaseId) ?? null
              : current.requestedBy,
        },
      };
    }
    return info;
  }, {});
}

const PRODUCTION_ACTIONS: ReleaseChangeAction[] = [
  ReleaseChangeAction.APPROVED,
  ReleaseChangeAction.ROLLED_BACK,
  ReleaseChangeAction.PUBLISHED_DIRECTLY,
];

export const versionReleaseInfo = { byVersion };

export type VersionReleaseInfo = {
  production: ReleaseChangeWithDetails | null;
  test: ReleaseChangeWithDetails | null;
  requestedBy: string | null;
};
