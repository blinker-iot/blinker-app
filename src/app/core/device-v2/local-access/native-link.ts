import { Capacitor, registerPlugin } from '@capacitor/core';
import type { LocalAccessMessageLink } from './client';

export interface NativeLocalWebSocket {
  open(options: { id: string; host: string; port: number }): Promise<void>;
  send(options: { id: string; data: string }): Promise<void>;
  receive(options: { id: string }): Promise<{ data: string }>;
  close(options: { id: string }): Promise<void>;
}
const native = registerPlugin<NativeLocalWebSocket>('BlinkerLocalWebSocket');

// A page/account/network owner supplies its abort signal. There is no browser
// WebSocket fallback and no global cleartext/mixed-content relaxation here.
export class NativeLocalAccessLink implements LocalAccessMessageLink {
  private readonly lifetime = new AbortController();
  private readonly id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  private sending = false;
  private receiving = false;
  private ready = false;
  private removeOwner?: () => void;
  private closePromise?: Promise<void>;

  private constructor(private readonly port: NativeLocalWebSocket) {}

  static async open(host: string, port: number, signal: AbortSignal,
    backend: NativeLocalWebSocket = native): Promise<NativeLocalAccessLink> {
    if (backend === native && (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('BlinkerLocalWebSocket')))
      throw new Error('LOCAL_WS_PLATFORM_UNAVAILABLE');
    const link = new NativeLocalAccessLink(backend);
    const abort = () => link.close();
    signal.addEventListener('abort', abort, { once: true });
    link.removeOwner = () => signal.removeEventListener('abort', abort);
    const timeout = setTimeout(abort, 15000);
    try {
      signal.throwIfAborted();
      await link.operation(() => backend.open({ id: link.id, host, port }), signal);
      link.ready = true;
      return link;
    } catch (error) {
      await link.close(); // A cleanup failure must never receive the retry-safe marker.
      if (!signal.aborted && error instanceof Error
        && ['LOCAL_WS_OPEN_FAILED', 'LOCAL_WS_DESTINATION_UNAVAILABLE', 'LOCAL_WS_CLOSED'].includes(error.message)) {
        throw Object.assign(new Error(error.message), { code: 'LOCAL_ACCESS_CANDIDATE_UNAVAILABLE', cause: error });
      }
      throw error;
    }
    finally { clearTimeout(timeout); }
  }

  async send(message: Uint8Array, signal: AbortSignal): Promise<void> {
    if (!this.ready || this.sending) throw new Error('LOCAL_WS_CLOSED_OR_BUSY');
    if (!(message instanceof Uint8Array) || message.length === 0 || message.length > 420)
      throw new Error('LOCAL_WS_RECORD_SIZE');
    this.sending = true;
    const timeout = setTimeout(() => this.close(), 3000);
    try {
      await this.operation(() => this.port.send({ id: this.id, data: btoa(String.fromCharCode(...message)) }), signal);
    } finally { this.sending = false; clearTimeout(timeout); }
  }

  async receive(signal: AbortSignal): Promise<Uint8Array> {
    if (!this.ready || this.receiving) throw new Error('LOCAL_WS_CLOSED_OR_BUSY');
    this.receiving = true;
    try {
      const result = await this.operation(() => this.port.receive({ id: this.id }), signal);
      if (typeof result?.data !== 'string' || result.data.length === 0 || result.data.length > 560)
        throw new Error('LOCAL_WS_RECORD_SIZE');
      const binary = atob(result.data);
      if (btoa(binary) !== result.data || binary.length > 420) throw new Error('LOCAL_WS_RECORD_INVALID');
      return Uint8Array.from(binary, character => character.charCodeAt(0));
    } catch (error) { this.close(); throw error; }
    finally { this.receiving = false; }
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.ready = false;
    this.lifetime.abort(new Error('LOCAL_WS_CLOSED'));
    this.removeOwner?.(); this.removeOwner = undefined;
    // Exact native id prevents a delayed close from retiring another owner.
    try { this.closePromise = Promise.resolve(this.port.close({ id: this.id })); }
    catch (error) { this.closePromise = Promise.reject(error); }
    this.closePromise = this.closePromise.catch(error => {
      throw Object.assign(new Error(error instanceof Error ? error.message : 'LOCAL_WS_CLEANUP_FAILED'),
        { code: 'LOCAL_WS_CLEANUP_FAILED', cause: error });
    });
    // Timer/abort callers may not await cleanup; retain failure for the owner.
    void this.closePromise.catch(() => undefined);
    return this.closePromise;
  }

  private async operation<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    const abort = () => this.close();
    signal.addEventListener('abort', abort, { once: true });
    let retire!: () => void;
    const closed = new Promise<never>((_, reject) => {
      retire = () => reject(this.lifetime.signal.reason);
      this.lifetime.signal.addEventListener('abort', retire, { once: true });
    });
    try {
      if (signal.aborted) this.close();
      this.lifetime.signal.throwIfAborted();
      const value = await Promise.race([work(), closed]);
      this.lifetime.signal.throwIfAborted();
      return value;
    } catch (error) { this.close(); throw error; }
    finally {
      signal.removeEventListener('abort', abort);
      this.lifetime.signal.removeEventListener('abort', retire);
      // The early-abort branch may reject before Promise.race is constructed.
      void closed.catch(() => undefined);
    }
  }
}
