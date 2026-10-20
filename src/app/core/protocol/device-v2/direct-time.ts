import { BBP2_FEATURE_TIME_SYNC, decodeTimeRequest, encodeTimeResponse,
  encodeCanonicalMap, encodeCanonicalUnsigned } from './codec';
import { Bbp2ErrorCode, Bbp2Frame, Bbp2FrameFlag, Bbp2MessageKind } from './types';

export const DIRECT_TIME_MAX_FRAME_BYTES = 40;

// Supplied only after carrier authentication, never from a page's requested role.
export interface DirectTimeOptions {
  permissions: number;
  features: number;
  maxFrameSize: number;
  utcNow?: () => number;
  monotonicNow?: () => number;
}

// One per existing Direct session, no socket, timer, retry or response queue.
export class DirectTimeResponder {
  private readonly enabled: boolean;
  private readonly utc: () => number;
  private readonly monotonic: () => number;
  private lastReply = -Infinity;

  constructor(options: DirectTimeOptions) {
    if (!Number.isInteger(options.permissions) || options.permissions < 0 || options.permissions > 0x0f
      || !Number.isInteger(options.features) || options.features < 0 || options.features > 0xffffffff
      || !Number.isInteger(options.maxFrameSize) || options.maxFrameSize < 10 || options.maxFrameSize > 0xffff)
      throw new Error('DIRECT_TIME_OPTIONS_INVALID');
    this.enabled = (options.permissions & 2) !== 0 && (options.features & BBP2_FEATURE_TIME_SYNC) !== 0
      && options.maxFrameSize >= DIRECT_TIME_MAX_FRAME_BYTES;
    this.utc = options.utcNow ?? Date.now;
    this.monotonic = options.monotonicNow ?? (() => performance.now());
  }

  reply(request: Bbp2Frame): Bbp2Frame | undefined {
    if (!this.enabled) return undefined;
    if (request.kind !== Bbp2MessageKind.TimeRequest || request.flags !== 0
      || !Number.isInteger(request.sequence) || request.sequence < 1 || request.sequence > 0xffff)
      throw new Error('DIRECT_TIME_REQUEST_INVALID');
    const nonce = decodeTimeRequest(request.body);
    const now = this.monotonic();
    if (!Number.isFinite(now) || now < 0 || now - this.lastReply < 5000) return undefined;
    this.lastReply = now; // Errors count too; wall-clock changes cannot bypass the quota.
    let kind = Bbp2MessageKind.TimeResponse, body: Uint8Array;
    try {
      body = encodeTimeResponse({ nonce, utcAtReplyMillis: this.utc(), uncertaintyMillis: 1000 });
    } catch {
      kind = Bbp2MessageKind.Error;
      body = encodeCanonicalMap([
        [0, encodeCanonicalUnsigned(Bbp2ErrorCode.Internal)],
        [1, encodeCanonicalUnsigned(request.sequence)],
      ]);
    }
    return { kind, flags: Bbp2FrameFlag.IsResponse, sequence: request.sequence, body };
  }
}
