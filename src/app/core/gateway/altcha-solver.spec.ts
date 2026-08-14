import { describe, expect, it, vi } from 'vitest';

import {
  AltchaChallenge,
  AltchaDigest,
  solveAltcha,
} from './altcha-solver';

describe('solveAltcha', () => {
  it('returns the UTF-8 JSON solution as Base64', async () => {
    const challenge: AltchaChallenge = {
      algorithm: 'SHA-256',
      challenge: 'ab',
      maxnumber: 5,
      salt: '盐-',
      signature: 'signed',
    };
    const decoder = new TextDecoder();
    const digest: AltchaDigest = vi.fn(async (value) => {
      const byte = decoder.decode(value) === '盐-2' ? 0xab : 0xcd;
      return Uint8Array.of(byte).buffer;
    });

    const result = await solveAltcha(challenge, { digest });
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(result), (character) => character.charCodeAt(0))
      )
    );

    expect(payload).toEqual({
      algorithm: 'SHA-256',
      challenge: 'ab',
      number: 2,
      salt: '盐-',
      signature: 'signed',
    });
    expect(digest).toHaveBeenCalledTimes(3);
  });

  it('rejects unsupported algorithms before hashing', async () => {
    const digest: AltchaDigest = vi.fn();

    await expect(
      solveAltcha(
        {
          algorithm: 'SHA-512',
          challenge: 'ab',
          maxnumber: 1,
          salt: 'salt',
          signature: 'signed',
        },
        { digest }
      )
    ).rejects.toThrow('Unsupported ALTCHA algorithm: SHA-512');
    expect(digest).not.toHaveBeenCalled();
  });

  it('honors an aborted signal', async () => {
    const controller = new AbortController();
    const digest: AltchaDigest = vi.fn();
    controller.abort();

    await expect(
      solveAltcha(createChallenge(), { digest, signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(digest).not.toHaveBeenCalled();
  });

  it('times out before starting work when the deadline has elapsed', async () => {
    const digest: AltchaDigest = vi.fn();

    await expect(
      solveAltcha(createChallenge(), { digest, timeoutMs: 0 })
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(digest).not.toHaveBeenCalled();
  });

  it('fails when no number through maxnumber solves the challenge', async () => {
    const digest: AltchaDigest = vi.fn(async () => Uint8Array.of(0xcd).buffer);

    await expect(
      solveAltcha(createChallenge(), { digest })
    ).rejects.toThrow('No ALTCHA solution found within maxnumber.');
    expect(digest).toHaveBeenCalledTimes(3);
  });
});

function createChallenge(): AltchaChallenge {
  return {
    algorithm: 'SHA-256',
    challenge: 'ab',
    maxnumber: 2,
    salt: 'salt',
    signature: 'signed',
  };
}
