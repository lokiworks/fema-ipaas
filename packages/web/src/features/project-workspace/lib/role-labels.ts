import { DefaultProjectRole } from '@fema-ipaas/shared';
import { t } from 'i18next';

function label(role: DefaultProjectRole | null | undefined): string {
  switch (role) {
    case DefaultProjectRole.ADMIN:
      return t('Owner');
    case DefaultProjectRole.DEVELOPER:
      return t('Can edit');
    case DefaultProjectRole.OPERATOR:
      return t('On-call');
    case DefaultProjectRole.VIEWER:
      return t('Can view');
    default:
      return t('No access');
  }
}

function viewerHint(): string {
  return t('You have "Can view" access in this project and can only view');
}

export const projectRoleLabels = { label, viewerHint };
