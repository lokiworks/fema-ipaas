import { ErrorCode } from '@fema-ipaas/core-utils';
import { CaptchaChallenge, CaptchaProvider } from '@fema-ipaas/shared';

import { HttpError } from '@/lib/api';

import { powSolver } from './pow-solver';

const REJECTION_MESSAGE = 'captchaVerificationFailed';

function isRejection(error: HttpError): boolean {
  const body = error.response?.data as
    | { code?: ErrorCode; params?: { message?: string } }
    | undefined;
  return (
    body?.code === ErrorCode.VALIDATION &&
    body?.params?.message === REJECTION_MESSAGE
  );
}

function isRequired(error: HttpError): boolean {
  const body = error.response?.data as { code?: ErrorCode } | undefined;
  return body?.code === ErrorCode.CAPTCHA_REQUIRED;
}

function needsFreshToken(error: HttpError): boolean {
  return isRejection(error) || isRequired(error);
}

function resolveMode({
  provider,
  turnstileSiteKey,
}: {
  provider: string | null | undefined;
  turnstileSiteKey: string | null;
}): CaptchaProvider {
  return provider === CaptchaProvider.TURNSTILE && turnstileSiteKey !== null
    ? CaptchaProvider.TURNSTILE
    : CaptchaProvider.BUILTIN;
}

function solveInWorker(challenge: CaptchaChallenge): Promise<string> {
  if (typeof Worker === 'undefined') {
    return solveOnMainThread(challenge);
  }
  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL('./captcha.worker.ts', import.meta.url), {
      type: 'module',
    });
    const finish = (settle: () => void) => {
      worker.terminate();
      settle();
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const token = tokenFromMessage(event.data);
      finish(() =>
        token === null
          ? reject(new Error('captcha worker returned no solution'))
          : resolve(token),
      );
    };
    worker.onerror = () =>
      finish(() => reject(new Error('captcha worker failed')));
    worker.postMessage(challenge);
  });
}

async function solveOnMainThread(challenge: CaptchaChallenge): Promise<string> {
  const solution = await powSolver.solve(challenge);
  if (solution === null) {
    throw new Error('captcha challenge has no solution');
  }
  return powSolver.encodeToken(solution);
}

function tokenFromMessage(data: unknown): string | null {
  if (
    typeof data === 'object' &&
    data !== null &&
    'token' in data &&
    typeof data.token === 'string'
  ) {
    return data.token;
  }
  return null;
}

export const captchaUtils = {
  isRejection,
  isRequired,
  needsFreshToken,
  resolveMode,
  solveInWorker,
};
