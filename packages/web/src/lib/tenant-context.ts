import { SAAS_LIMITS } from '@fema-ipaas/shared';

const STORAGE_KEY = 'tenantContext';

function read(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value !== null && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function write(slugOrId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, slugOrId);
  } catch {
    return;
  }
}

function clear(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

function headers(): Record<string, string> {
  const current = read();
  return current === null ? {} : { [SAAS_LIMITS.tenantHeader]: current };
}

function loginPath(slug: string): string {
  return `${SAAS_LIMITS.tenantPathPrefix}${encodeURIComponent(slug)}`;
}

export const tenantContext = {
  get: read,
  set: write,
  clear,
  headers,
  loginPath,
};
