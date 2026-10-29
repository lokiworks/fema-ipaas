vi.mock('i18next', () => ({ t: (key: string) => key }));

import { errorExplanation } from '@/lib/error-explanation';

describe('errorExplanation.explain', () => {
  it.each([
    ['fetch failed', 'The request could not reach the other system'],
    [
      'connect ECONNREFUSED 127.0.0.1:80',
      'The other system refused the connection',
    ],
    [
      'connect ETIMEDOUT 10.0.0.1:443',
      'The other system did not respond in time',
    ],
    [
      'getaddrinfo ENOTFOUND api.example.invalid',
      'The domain name could not be resolved',
    ],
    ['read ECONNRESET', 'The connection was closed by the other system'],
    [
      'The organization in Root organization OId does not exist: 123 (Beisen code 417 组织单元不存在). Pick the root organization again.',
      'The organization in Root organization OId does not exist. Pick it again.',
    ],
    [
      '组织单元不存在 (Beisen code 417)',
      'The Beisen organization OId does not exist',
    ],
    [
      'self-signed certificate',
      'The security certificate could not be verified',
    ],
  ])('explains %s', (message, headline) => {
    expect(errorExplanation.explain({ message })?.headline).toBe(headline);
  });

  it.each([
    'ReferenceError: setTimeout is not defined',
    'ReferenceError: clearTimeout is not defined',
    'TypeError: setTimeout is not a function',
  ])('does not mistake the code error %s for a timeout', (message) => {
    expect(errorExplanation.explain({ message })).toBeNull();
  });

  it.each([
    'timeout of 5000ms exceeded',
    'Request timed out',
    'connect ETIMEDOUT 10.0.0.1:443',
    'ESOCKETTIMEDOUT',
    'Gateway Timeout',
    'Connection timeout',
  ])('still explains the real timeout %s', (message) => {
    expect(errorExplanation.explain({ message })?.headline).toBe(
      'The other system did not respond in time',
    );
  });

  it('explains the platform step timeout with its limit', () => {
    const explanation = errorExplanation.explain({
      message:
        'The step ran longer than 5 seconds and was stopped (FEMA_STEP_TIMEOUT)',
    });
    expect(explanation?.headline).toBe(
      'The step ran longer than {seconds} seconds and was stopped',
    );
    expect(explanation?.hint).toContain('time limit');
  });

  it('returns null for messages it does not know', () => {
    expect(
      errorExplanation.explain({ message: 'value is required' }),
    ).toBeNull();
  });
});
