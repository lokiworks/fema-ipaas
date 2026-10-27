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

  it('returns null for messages it does not know', () => {
    expect(
      errorExplanation.explain({ message: 'value is required' }),
    ).toBeNull();
  });
});
