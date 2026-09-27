function expiryStatus({
  expiresAt,
  now,
}: {
  expiresAt: string | null | undefined;
  now: Date;
}): ExpiryStatus {
  if (!expiresAt) {
    return 'none';
  }
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (left <= 0) {
    return 'expired';
  }
  if (left <= EXPIRING_SOON_MS) {
    return 'expiringSoon';
  }
  return 'normal';
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined) {
    return '';
  }
  return JSON.stringify(value);
}

const EXPIRING_SOON_MS = 2 * 24 * 60 * 60 * 1000;

export const dataStoreUtils = {
  expiryStatus,
  displayValue,
};

export type ExpiryStatus = 'none' | 'expired' | 'expiringSoon' | 'normal';
