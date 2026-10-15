import { HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import { API } from '../../../configs/api.config';
import { InterfaceTile, validateProposal } from './interface-draft';
import { UiTheme } from '../../../core/device-v2/ui-theme';
import type { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { draftProposal, validateWorkflowResult, workflowDefaults, workflowManifest, workflowProgress } from './interface-workflow';
import { interfaceGenerationError as fail } from './interface-generation-error';

export type InterfaceGenerationResult = ReturnType<typeof validateProposal> & { warning?: string };

export interface InterfaceGenerationOptions {
  signal?: AbortSignal;
  snapshot?: DeviceUiSnapshot;

  base?: { tiles: InterfaceTile[]; summary: string };

  onProgress?: (message: string) => void;
  onPreview?: (result: InterfaceGenerationResult) => void;
}

@Injectable({ providedIn: 'root' })
export class InterfaceGenerationService {
  constructor(private readonly http: HttpClient) {}
  refine(prompt: string, tiles: InterfaceTile[], style: UiTheme,
    options: InterfaceGenerationOptions & { base: NonNullable<InterfaceGenerationOptions['base']>; snapshot: DeviceUiSnapshot }) {
    return this.generate(prompt, tiles, style, options);
  }

  generate(prompt: string, tiles: InterfaceTile[], style: UiTheme = 'natural',
    options: InterfaceGenerationOptions = {}): Promise<InterfaceGenerationResult> {
    const manifest = options.snapshot ? workflowManifest(tiles, options.snapshot) : undefined;

    return new Promise((resolve, reject) => {
      const subscription = new Subscription();
      let offset = 0;
      let result: InterfaceGenerationResult | undefined;
      let draft: InterfaceGenerationResult | undefined;
      let draftConfiguration: unknown;
      let settled = false;
      let ignoreProgress = false;

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
      const timer = setTimeout(() => finish(fail('INTERFACE_AI_TIMEOUT')), options.snapshot ? 200000 : 55000);

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

          if (options.snapshot) {
            if (event.type === 'stage') options.onProgress?.(workflowProgress(event.stage, event.round));
            else if (event.type === 'draft') {
              draft = validateWorkflowResult(event.data, tiles, options.snapshot, style, event.round);
              draftConfiguration = event.data.proposal;

              options.onPreview?.(draft);
            }
            else if (event.type === 'complete') {
              if (!draft || JSON.stringify(event.data?.proposal) !== JSON.stringify(draftConfiguration)) throw fail('INTERFACE_AI_INVALID_RESPONSE');

              result = validateWorkflowResult(event.data, tiles, options.snapshot, style, event.round);
            }
            else throw fail('INTERFACE_AI_INVALID_RESPONSE');

            continue;
          }

          if (event.type === 'preview') options.onPreview?.(validateProposal(event.data, tiles));
          else if (event.type === 'complete' || (!event.type && event.data)) result = validateProposal(event.data, tiles);
          else if (event.type !== 'start') throw fail('INTERFACE_AI_INVALID_RESPONSE');
        }
      };

      // HttpClient retains the normal Bearer authentication and token-refresh chain.
      subscription.add(this.http.post(options.base ? API.INTERFACE_REFINE : options.snapshot ? API.INTERFACE_WORKFLOW : API.INTERFACE_GENERATE, {
        mode: 'component', prompt, style,
        ...(options.base ? { baseProposal: draftProposal(options.base.tiles, options.base.summary) } : {}),
        // Device identifiers, live values, credentials and bindings remain local.
        ...(options.snapshot ? { manifest, defaults: workflowDefaults(tiles, options.snapshot) }
          : { widgets: tiles.map(({ id, title, type }) => ({ id, title, type })) }),
      }, { headers: { Accept: 'application/x-ndjson' }, observe: 'events', responseType: 'text', reportProgress: true }).subscribe({
        next: event => {
          try {
            if (event.type === HttpEventType.ResponseHeader) ignoreProgress = event.status >= 400;
            if (event.type === HttpEventType.DownloadProgress && !ignoreProgress && event.partialText) consume(event.partialText, false);
            if (event.type === HttpEventType.Response) { consume(event.body || '', true); finish(); }
          } catch (error) {
            finish((error as { code?: string })?.code ? error : fail('INTERFACE_AI_INVALID_RESPONSE'));
          }
        },
        error: error => finish(error),
        complete: () => finish(),
      }));
    });
  }
}
