import { HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import { InterfacePreviewService } from './interface-preview.service';
import { API } from '../../../configs/api.config';
import { InterfaceDensity, InterfaceTile, validateProposal } from './interface-draft';
import { UiTheme } from '../../../core/device-v2/ui-theme';

import type { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { draftProposal, validateWorkflowResult, workflowManifest, workflowProgress, type WorkflowPreview } from './interface-workflow';

export type InterfaceGenerationResult = ReturnType<typeof validateProposal> & { preview?: WorkflowPreview };
export interface InterfaceGenerationOptions {
  signal?: AbortSignal;
  snapshot?: DeviceUiSnapshot;
  base?: { tiles: InterfaceTile[]; summary: string; preview?: WorkflowPreview };
  onProgress?: (message: string) => void;
  onPreview?: (result: InterfaceGenerationResult) => void;
}

@Injectable({ providedIn: 'root' })
export class InterfaceGenerationService {
  constructor(private readonly http: HttpClient, private readonly previews: InterfacePreviewService) {}
  refine(prompt: string, density: InterfaceDensity, tiles: InterfaceTile[], style: UiTheme,
    options: InterfaceGenerationOptions & { base: NonNullable<InterfaceGenerationOptions['base']>; snapshot: DeviceUiSnapshot }) {
    return this.generate(prompt, density, tiles, style, options);
  }

  generate(prompt: string, density: InterfaceDensity, tiles: InterfaceTile[], style: UiTheme = 'natural',
    options: InterfaceGenerationOptions = {}): Promise<InterfaceGenerationResult> {
    const manifest = options.snapshot ? workflowManifest(tiles, options.snapshot) : undefined;
    return new Promise((resolve, reject) => {
      const captureController = new AbortController();
      let rendering = false;
      let lastRound = 0;
      let rendered: { proposal: unknown; image: string; round: number } | undefined;
      const subscription = new Subscription();
      let offset = 0;
      let result: InterfaceGenerationResult | undefined;
      let draft: InterfaceGenerationResult | undefined;
      let draftConfiguration: unknown;
      let settled = false;
      let ignoreProgress = false;
      const fail = (code: string) => Object.assign(new Error(code), { code });
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        captureController.abort();
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        subscription.unsubscribe();
        if ((error || !result) && draft && (error as { code?: string } | undefined)?.code !== 'INTERFACE_AI_CANCELLED') {
          resolve({ ...draft, preview: { image: draft.preview?.image || '', passed: false,
            review: '生成或审查未完成，当前草稿已保留，可继续微调。',
            issues: [{ widgetId: '', problem: '生成或审查未完成', suggestion: '基于当前草稿继续 AI 微调' }] } });
        }
        else if (error) reject(error);
        else if (result) resolve(result);
        else reject(fail('INTERFACE_AI_INCOMPLETE'));
      };
      const abort = () => finish(fail('INTERFACE_AI_CANCELLED'));
      const timer = setTimeout(() => finish(fail('INTERFACE_AI_TIMEOUT')), options.snapshot ? 420000 : 55000);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) { abort(); return; }
      const consume = (text: string, final: boolean) => {
        if (text.length > (options.snapshot ? 8 : 2) * 1024 * 1024) throw fail('INTERFACE_AI_INVALID_RESPONSE');
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
            else if (event.type === 'render-request') {
              if (rendering || !Number.isInteger(event.round) || event.round <= lastRound || event.round > 3
                || typeof event.ticket !== 'string' || !/^[0-9a-f-]{36}$/.test(event.ticket)) throw fail('INTERFACE_AI_INVALID_RESPONSE');
              rendering = true;
              lastRound = event.round;
              void this.previews.render(event.proposal, tiles, options.snapshot, style, captureController.signal)
                .then(image => {
                  if (settled) return;
                  if (draft?.preview) draft.preview.image = `data:image/jpeg;base64,${image.preview.data}`;
                  rendered = { proposal: event.proposal, image: image.preview.data, round: event.round };
                  rendering = false;
                  subscription.add(this.http.post(API.INTERFACE_PREVIEW, { ticket: event.ticket, ...image }).subscribe({
                    error: error => finish(error),
                  }));
                }).catch(error => finish(error));
            }
            else if (event.type === 'review') options.onProgress?.(event.review?.passed
              ? '视觉审查通过，正在准备预览…' : '正在整理界面调整建议…');
            else if (event.type === 'complete') {
              if (!draft || JSON.stringify(event.data?.proposal) !== JSON.stringify(draftConfiguration)
                || (event.data?.preview && (!rendered || event.round !== rendered.round || event.data.preview.data !== rendered.image))) throw fail('INTERFACE_AI_INVALID_RESPONSE');
              result = validateWorkflowResult(event.data, tiles, options.snapshot, style, event.round);
            }
            else if (event.type !== 'matched') throw fail('INTERFACE_AI_INVALID_RESPONSE');
            continue;
          }
          if (event.type === 'preview') options.onPreview?.(validateProposal(event.data, tiles));
          else if (event.type === 'complete' || (!event.type && event.data)) result = validateProposal(event.data, tiles);
          else if (event.type !== 'start') throw fail('INTERFACE_AI_INVALID_RESPONSE');
        }
      };
      // HttpClient retains the normal Bearer authentication and token-refresh chain.
      subscription.add(this.http.post(options.base ? API.INTERFACE_REFINE : options.snapshot ? API.INTERFACE_WORKFLOW : API.INTERFACE_GENERATE, {
        prompt, density, style,
        ...(options.base ? { baseProposal: draftProposal(options.base.tiles, options.base.summary),
          ...(options.base.preview ? { priorReview: { passed: options.base.preview.passed,
            summary: options.base.preview.review, issues: options.base.preview.issues.slice(0, 16) } } : {}) } : {}),
        // Device identifiers, live values, credentials and bindings remain local.
        ...(options.snapshot ? { manifest }
          : { widgets: tiles.map(({ id, title, type }) => ({ id, title, type })) }),
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
