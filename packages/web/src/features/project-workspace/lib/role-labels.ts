import { DefaultProjectRole } from '@fema-ipaas/shared';
import { t } from 'i18next';

function label(role: DefaultProjectRole | null | undefined): string {
  switch (role) {
    case DefaultProjectRole.ADMIN:
      return t('Admin');
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

function memberLabel({
  role,
  isOwner,
}: {
  role: DefaultProjectRole | null | undefined;
  isOwner: boolean;
}): string {
  return isOwner ? t('Owner') : label(role);
}

function description(role: DefaultProjectRole): string {
  switch (role) {
    case DefaultProjectRole.ADMIN:
      return t('Everything, plus managing members and project settings');
    case DefaultProjectRole.DEVELOPER:
      return t('Build, test and publish workflows');
    case DefaultProjectRole.OPERATOR:
      return t('Run and replay workflows, handle issues, manage connections');
    case DefaultProjectRole.VIEWER:
      return t('View workflows, runs and issues without changing anything');
  }
}

function viewerHint(): string {
  return t(
    'You have "Can view" access in this project, so you can view workflows but not create or change them',
  );
}

export const projectRoleLabels = {
  label,
  memberLabel,
  description,
  viewerHint,
};
