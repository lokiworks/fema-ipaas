import { createHash } from 'crypto';

import { CaptchaSolution } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { powSolver } from '@/features/authentication/utils/pow-solver';

function challengeFor({ salt, number }: { salt: string; number: number }) {
  return {
    algorithm: 'SHA-256' as const,
    challenge: createHash('sha256').update(`${salt}${number}`).digest('hex'),
    salt,
    maxNumber: 500,
    signature: 'signature-from-server',
  };
}

function decodeToken(token: string): unknown {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
}

describe('powSolver', () => {
  it('finds the number whose digest matches the challenge', async () => {
    const solution = await powSolver.solve(
      challengeFor({ salt: 'abc123', number: 237 }),
    );
    expect(solution?.number).toBe(237);
  });

  it('finds the first candidate when the answer is zero', async () => {
    const solution = await powSolver.solve(
      challengeFor({ salt: 'zero', number: 0 }),
    );
    expect(solution?.number).toBe(0);
  });

  it('gives up when the answer lies beyond the allowed range', async () => {
    const challenge = challengeFor({ salt: 'far', number: 900 });
    expect(await powSolver.solve(challenge)).toBeNull();
  });

  it('echoes the server fields back so the signature can be checked', async () => {
    const challenge = challengeFor({ salt: 'echo', number: 12 });
    const solution = await powSolver.solve(challenge);
    expect(solution).toEqual({
      algorithm: 'SHA-256',
      challenge: challenge.challenge,
      salt: 'echo',
      number: 12,
      signature: 'signature-from-server',
    });
  });

  it('encodes the solution as URL-safe base64 JSON', async () => {
    const solution = await powSolver.solve(
      challengeFor({ salt: '??>>~~', number: 77 }),
    );
    if (solution === null) {
      throw new Error('expected a solution');
    }
    const token = powSolver.encodeToken(solution);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(CaptchaSolution.parse(decodeToken(token))).toEqual(solution);
  });
});
