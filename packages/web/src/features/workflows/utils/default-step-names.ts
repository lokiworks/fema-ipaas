import { t } from 'i18next';

function branchName({ index }: { index: number }): string {
  return t('Branch {index}', { index: String(index) });
}

function fallbackBranchName(): string {
  return t('Otherwise');
}

function copySuffix(): string {
  return t('copiedStepSuffix');
}

export const defaultStepNames = { branchName, fallbackBranchName, copySuffix };
