import { HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import { API } from '../../../configs/api.config';
import { InterfaceDensity, InterfaceTile, validateProposal } from './interface-draft';
import { InterfaceStyle } from '../../../core/device-v2/interface-style';

export type InterfaceGenerationResult = ReturnType<typeof validateProposal>;
export interface InterfaceGenerationOptions {
  signal?: AbortSignal;
  onPreview?: (result: InterfaceGenerationResult) => void;
}

@Injectable({ providedIn: 'root' })
export class InterfaceGenerationService {
  constructor(private readonly http: HttpClient) {}
  generate(prompt: string, density: InterfaceDensity, tiles: InterfaceTile[], style: InterfaceStyle = 'minimal',
    options: InterfaceGenerationOptions = {}): Promise<InterfaceGenerationResult> {
    return new Promise((resolve, reject) => {
      const subscription = new Subscription();
      let offset = 0;
      let result: InterfaceGenerationResult | undefined;
      let settled = false;
      let ignoreProgress = false;
      const fail = (code: string) => Object.assign(new Error(code), { code });
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        subscription.unsubscribe();
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(fail('INTERFACE_AI_INCOMPLETE'));
      };
      const abort = () => finish(fail('INTERFACE_AI_CANCELLED'));
      const timer = setTimeout(() => finish(fail('INTERFACE_AI_TIMEOUT')), 55000);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) { abort(); return; }
      const consume = (text: string, final: boolean) => {
        if (text.length > 2 * 1024 * 1024) throw fail('INTERFACE_AI_INVALID_RESPONSE');
        while (offset < text.length) {
          const end = text.indexOf('\n', offset);
          if (end < 0 && !final) break;
          const line = text.slice(offset, end < 0 ? text.length : end).trim();
          offset = end < 0 ? text.length : end + 1;
          if (!line) continue;
          const event = JSON.parse(line);
          if (result) throw fail('INTERFACE_AI_INVALID_RESPONSE');
          if (event.type === 'error') throw fail(event.code || 'INTERFACE_AI_GENERATION_FAILED');
          if (event.type === 'preview') options.onPreview?.(validateProposal(event.data, tiles));
          else if (event.type === 'complete' || (!event.type && event.data)) result = validateProposal(event.data, tiles);
          else if (event.type !== 'start') throw fail('INTERFACE_AI_INVALID_RESPONSE');
        }
      };
      // HttpClient retains the normal Bearer authentication and token-refresh chain.
      subscription.add(this.http.post(API.INTERFACE_GENERATE, {
        prompt, density, style,
        // Device identifiers, live values, credentials and bindings remain local.
        widgets: tiles.map(({ id, title, type }) => ({ id, title, type })),
      }, { headers: { Accept: 'application/x-ndjson' }, observe: 'events', responseType: 'text', reportProgress: true }).subscribe({
        next: event => {
          try {
            if (event.type === HttpEventType.ResponseHeader) ignoreProgress = event.status >= 400;
            if (event.type === HttpEventType.DownloadProgress && !ignoreProgress && event.partialText) consume(event.partialText, false);
            if (event.type === HttpEventType.Response) { consume(event.body || '', true); finish(); }
          } catch (error) { finish(error); }
        },
        error: error => finish(error),
        complete: () => finish(),
      }));
    });
  }
}
