import { CaptchaChallenge } from '@fema-ipaas/shared';

import { powSolver } from './pow-solver';

globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
  const parsed = CaptchaChallenge.safeParse(event.data);
  if (!parsed.success) {
    globalThis.postMessage({ ok: false });
    return;
  }
  powSolver
    .solve(parsed.data)
    .then((solution) => {
      globalThis.postMessage(
        solution === null
          ? { ok: false }
          : { ok: true, token: powSolver.encodeToken(solution) },
      );
    })
    .catch(() => globalThis.postMessage({ ok: false }));
});
