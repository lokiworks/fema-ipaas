import { t } from 'i18next';

function branchName({ index }: { index: number }): string {
  return t('Branch {index}', { index: String(index) });
}

function copySuffix(): string {
  return t('copiedStepSuffix');
}

export const defaultStepNames = { branchName, copySuffix };
