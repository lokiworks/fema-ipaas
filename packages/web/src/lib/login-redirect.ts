import { isNil, tryCatchSync } from '@fema-ipaas/core-utils';

function safePath(raw: string | null | undefined): string | null {
  if (isNil(raw) || !raw.startsWith('/') || /^\/[/\\]/.test(raw)) {
    return null;
  }
  const { data: url } = tryCatchSync(() => new URL(raw, PROBE_ORIGIN));
  if (isNil(url) || url.origin !== PROBE_ORIGIN) {
    return null;
  }
  const isAuthPage = AUTH_PATHS.some(
    (path) => url.pathname === path || url.pathname.startsWith(`${path}/`),
  );
  if (isAuthPage) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function signInPath(from: string | null | undefined): string {
  const target = safePath(from);
  if (isNil(target) || target === '/') {
    return SIGN_IN_PATH;
  }
  return `${SIGN_IN_PATH}?${new URLSearchParams({
    [FROM_PARAM]: target,
  }).toString()}`;
}

function rememberForExternalSignIn(from: string | null | undefined): void {
  const target = safePath(from);
  tryCatchSync(() => {
    if (isNil(target)) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, target);
  });
}

function consume({ requested }: { requested: string | null }): string {
  const { data: stored } = tryCatchSync(() => {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return value;
  });
  return safePath(requested) ?? safePath(stored) ?? DEFAULT_PATH;
}

export const loginRedirect = {
  safePath,
  signInPath,
  rememberForExternalSignIn,
  consume,
};

const PROBE_ORIGIN = 'http://redirect.invalid';
const SIGN_IN_PATH = '/sign-in';
const FROM_PARAM = 'from';
const DEFAULT_PATH = '/';
const STORAGE_KEY = 'loginRedirectFrom';
const AUTH_PATHS = [
  '/sign-in',
  '/sign-up',
  '/setup',
  '/sso',
  '/invitation',
  '/forget-password',
  '/reset-password',
  '/verify-email',
  '/authenticate',
  '/create-tenant',
];
