export interface AltchaChallenge {
  algorithm: string;
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
}

export type AltchaDigest = (value: Uint8Array) => Promise<ArrayBuffer>;

export interface AltchaSolverOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  digest?: AltchaDigest;
}

const SUPPORTED_ALGORITHM = 'SHA-256';
const YIELD_INTERVAL = 1000;

export async function solveAltcha(
  challenge: AltchaChallenge,
  options: AltchaSolverOptions = {}
): Promise<string> {
  if (challenge.algorithm !== SUPPORTED_ALGORITHM) {
    throw new Error(`Unsupported ALTCHA algorithm: ${challenge.algorithm}`);
  }

  const digest = options.digest ?? digestSha256;
  const encoder = new TextEncoder();
  const deadline =
    options.timeoutMs === undefined ? undefined : Date.now() + options.timeoutMs;

  for (let number = 0; number <= challenge.maxnumber; number += 1) {
    assertCanContinue(options.signal, deadline);

    const hash = await digest(encoder.encode(`${challenge.salt}${number}`));
    assertCanContinue(options.signal, deadline);

    if (toHex(hash) === challenge.challenge.toLowerCase()) {
      return encodePayload({
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        number,
        salt: challenge.salt,
        signature: challenge.signature,
      });
    }

    if ((number + 1) % YIELD_INTERVAL === 0) {
      await yieldToEventLoop();
    }
  }

  throw new Error('No ALTCHA solution found within maxnumber.');
}

async function digestSha256(value: Uint8Array): Promise<ArrayBuffer> {
  return globalThis.crypto.subtle.digest('SHA-256', value as BufferSource);
}

function assertCanContinue(signal: AbortSignal | undefined, deadline?: number): void {
  if (signal?.aborted) {
    throw new DOMException('ALTCHA solving was aborted.', 'AbortError');
  }

  if (deadline !== undefined && Date.now() >= deadline) {
    throw new DOMException('ALTCHA solving timed out.', 'TimeoutError');
  }
}

function toHex(hash: ArrayBuffer): string {
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function encodePayload(payload: {
  algorithm: string;
  challenge: string;
  number: number;
  salt: string;
  signature: string;
}): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
