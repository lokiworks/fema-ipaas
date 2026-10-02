function hasUnpublishedChanges({
  hasDeployment,
  isDraft,
  draftChanged,
}: UnpublishedChangesParams): boolean {
  if (!hasDeployment || !isDraft) {
    return false;
  }
  return draftChanged !== false;
}

export const unpublishedChanges = { hasUnpublishedChanges };

type UnpublishedChangesParams = {
  hasDeployment: boolean;
  isDraft: boolean;
  draftChanged: boolean | null;
};
