import { BlueprintVersionStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';

function label(status: BlueprintVersionStatus): string {
  switch (status) {
    case BlueprintVersionStatus.CANARY:
      return t('Rolling out to canary');
    case BlueprintVersionStatus.FULL:
      return t('Fully released');
    case BlueprintVersionStatus.STOPPED:
      return t('Support stopped');
  }
}

function badgeVariant(
  status: BlueprintVersionStatus,
): 'info' | 'success' | 'secondary' {
  switch (status) {
    case BlueprintVersionStatus.CANARY:
      return 'info';
    case BlueprintVersionStatus.FULL:
      return 'success';
    case BlueprintVersionStatus.STOPPED:
      return 'secondary';
  }
}

export const blueprintVersionStatusUtils = {
  label,
  badgeVariant,
};
