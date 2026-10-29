import { ProjectType } from '@fema-ipaas/shared';
import { t } from 'i18next';

function isPersonal(
  project: { type: ProjectType } | null | undefined,
): boolean {
  return project?.type === ProjectType.PERSONAL;
}

function personalReason(): string {
  return t(PERSONAL_PROJECT_HAS_NO_MEMBERS);
}

export const projectSharingUtils = { isPersonal, personalReason };

export const PERSONAL_PROJECT_HAS_NO_MEMBERS = 'personalProjectHasNoMembers';
