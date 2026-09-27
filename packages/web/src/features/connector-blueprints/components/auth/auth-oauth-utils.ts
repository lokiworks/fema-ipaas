function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function generateCodeVerifier(): string {
  return randomToken(32).slice(0, 43);
}

function generateState(): string {
  return randomToken(16);
}

async function codeChallengeOf(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(codeVerifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

function buildAuthorizationUrl({
  authorizeUrl,
  clientId,
  redirectUrl,
  scope,
  state,
  codeChallenge,
}: BuildAuthorizationUrlParams): string {
  const url = new URL(authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUrl);
  if (scope.trim().length > 0) {
    url.searchParams.set('scope', scope);
  }
  url.searchParams.set('state', state);
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

async function authorizationRequestOf({
  authorizeUrl,
  clientId,
  redirectUrl,
  scope,
  pkce,
}: AuthorizationRequestParams): Promise<AuthorizationRequest> {
  const codeVerifier = pkce ? generateCodeVerifier() : undefined;
  const codeChallenge = codeVerifier
    ? await codeChallengeOf(codeVerifier)
    : undefined;
  const authorizationUrl = buildAuthorizationUrl({
    authorizeUrl,
    clientId,
    redirectUrl,
    scope,
    state: generateState(),
    codeChallenge,
  });
  return { authorizationUrl, codeVerifier };
}

export const authOAuthUtils = {
  generateCodeVerifier,
  generateState,
  codeChallengeOf,
  buildAuthorizationUrl,
  authorizationRequestOf,
};

type BuildAuthorizationUrlParams = {
  authorizeUrl: string;
  clientId: string;
  redirectUrl: string;
  scope: string;
  state: string;
  codeChallenge?: string;
};

type AuthorizationRequestParams = {
  authorizeUrl: string;
  clientId: string;
  redirectUrl: string;
  scope: string;
  pkce: boolean;
};

export type AuthorizationRequest = {
  authorizationUrl: string;
  codeVerifier: string | undefined;
};
