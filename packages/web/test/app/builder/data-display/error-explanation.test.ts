vi.mock('i18next', () => ({ t: (key: string) => key }));

import { errorExplanation } from '@/app/builder/data-display/error-explanation';

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

  it('returns null for messages it does not know', () => {
    expect(
      errorExplanation.explain({ message: 'value is required' }),
    ).toBeNull();
  });
});
