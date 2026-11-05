import { CaptchaChallenge, CaptchaSolution } from '@fema-ipaas/shared';

import { sha256Utils } from './sha256-utils';

async function findNumber({
  challenge,
  salt,
  maxNumber,
  hash,
}: {
  challenge: string;
  salt: string;
  maxNumber: number;
  hash: (text: string) => Promise<string>;
}): Promise<number | null> {
  for (let candidate = 0; candidate <= maxNumber; candidate++) {
    const digest = await hash(`${salt}${candidate}`);
    if (digest === challenge) {
      return candidate;
    }
  }
  return null;
}

async function solve(
  challenge: CaptchaChallenge,
): Promise<CaptchaSolution | null> {
  const number = await findNumber({
    challenge: challenge.challenge,
    salt: challenge.salt,
    maxNumber: challenge.maxNumber,
    hash: sha256Utils.sha256Hex,
  });
  if (number === null) {
    return null;
  }
  return {
    algorithm: challenge.algorithm,
    challenge: challenge.challenge,
    salt: challenge.salt,
    number,
    signature: challenge.signature,
  };
}

function encodeToken(solution: CaptchaSolution): string {
  const bytes = new TextEncoder().encode(JSON.stringify(solution));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    '',
  );
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export const powSolver = {
  findNumber,
  solve,
  encodeToken,
};
