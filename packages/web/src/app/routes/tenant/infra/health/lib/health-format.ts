import i18next, { t } from 'i18next';

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat(i18next.language, {
    year: 'numeric',
    month: 'long',
  }).format(date);
}

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat(i18next.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function axisDayLabel(date: Date): string {
  return new Intl.DateTimeFormat(i18next.language, {
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

function dateTimeLabel(date: Date): string {
  return new Intl.DateTimeFormat(i18next.language, {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function executionModeLabel(mode: string | null): string {
  switch (mode) {
    case null:
      return t('Unknown');
    case 'SANDBOX_PROCESS':
      return t('Process sandbox');
    case 'SANDBOX_CODE_ONLY':
      return t('Code-only sandbox');
    case 'SANDBOX_CODE_AND_PROCESS':
      return t('Code and process sandbox');
    case 'UNSANDBOXED':
      return t('No sandbox');
    default:
      return mode;
  }
}

function fileStorageLabel(location: string | null): string {
  switch (location) {
    case null:
      return t('Unknown');
    case 'DB':
      return t('Database');
    case 'S3':
      return t('Object storage (S3)');
    default:
      return location;
  }
}

function workerStatusLabel(status: string): string {
  switch (status) {
    case 'ONLINE':
      return t('Online');
    case 'DRAINING':
      return t('Draining');
    case 'OFFLINE':
      return t('Offline');
    default:
      return status;
  }
}

export const healthFormat = {
  monthLabel,
  dayLabel,
  axisDayLabel,
  dateTimeLabel,
  executionModeLabel,
  fileStorageLabel,
  workerStatusLabel,
};
