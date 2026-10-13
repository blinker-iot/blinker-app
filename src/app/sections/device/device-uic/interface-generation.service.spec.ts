import { HttpEvent, HttpEventType, HttpHeaderResponse, HttpResponse } from '@angular/common/http';
import { of, Subject } from 'rxjs';
import { InterfaceGenerationService } from './interface-generation.service';
import { InterfaceTile } from './interface-draft';
import { UI_THEME_IDS } from '../../../core/device-v2/ui-theme';

const tile: InterfaceTile = { id: 'power', key: 'private-key', type: 'switch', title: '电源', value: '开启', unit: '', width: 8, emphasized: false, legacy: { mode: 1 } };
const proposal = { summary: '主控置顶', widgets: [{ id: 'power', title: '电源', width: 8, emphasized: true }] };
const line = (type: string, data?: unknown) => JSON.stringify({ type, data }) + '\n';

describe('style generation transport', () => {
  it('sends the selected style with descriptors only and keeps local bindings', async () => {
    const post = vi.fn().mockReturnValue(of(new HttpResponse({ body: JSON.stringify({ data: proposal }) })));
    const service = new InterfaceGenerationService({ post } as never);

    for (const style of UI_THEME_IDS) {
      const result = await service.generate('主控置顶', [tile], style);

      expect(post.mock.lastCall?.[1]).toEqual({ mode: 'component', prompt: '主控置顶', style, widgets: [{ id: 'power', title: '电源', type: 'switch' }] });
      expect(result.tiles[0].key).toBe('private-key'); expect(result.tiles[0].legacy).toEqual({ mode: 1 });
    }
  });

  it('renders complete streamed previews before completion, tolerates split lines and avoids duplicate delivery', async () => {
    const events = new Subject<HttpEvent<string>>();
    const onPreview = vi.fn();
    const service = new InterfaceGenerationService({ post: () => events } as never);
    let completed = false;
    const pending = service.generate('test', [tile], 'dark', { onPreview }).then(value => { completed = true; return value; });
    const preview = line('start') + line('preview', proposal);

    events.next({ type: HttpEventType.DownloadProgress, loaded: 5, partialText: preview.slice(0, -2) });
    expect(onPreview).not.toHaveBeenCalled();
    events.next({ type: HttpEventType.DownloadProgress, loaded: preview.length, partialText: preview });
    expect(onPreview).toHaveBeenCalledTimes(1); expect(completed).toBe(false);
    events.next(new HttpResponse({ body: preview + line('complete', proposal) }));
    expect((await pending).tiles[0].key).toBe('private-key'); expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it('leaves error-response chunks to the authentication interceptor before a successful replay', async () => {
    const events = new Subject<HttpEvent<string>>();
    const pending = new InterfaceGenerationService({ post: () => events } as never).generate('test', [tile]);

    events.next(new HttpHeaderResponse({ status: 401 }));
    events.next({ type: HttpEventType.DownloadProgress, loaded: 20, partialText: '{"errorCode":"AUTH_TOKEN_EXPIRED"}\n' });
    expect(events.observed).toBe(true);
    events.next(new HttpHeaderResponse({ status: 200 }));
    events.next(new HttpResponse({ body: line('complete', proposal) }));
    expect((await pending).summary).toBe(proposal.summary);
  });

  it('aborts the HTTP subscription and never delivers late previews', async () => {
    const events = new Subject<HttpEvent<string>>();
    const signal = new AbortController(); const onPreview = vi.fn();
    const pending = new InterfaceGenerationService({ post: () => events } as never).generate('test', [tile], 'natural', { signal: signal.signal, onPreview });

    signal.abort();
    await expect(pending).rejects.toMatchObject({ code: 'INTERFACE_AI_CANCELLED' });
    expect(events.observed).toBe(false);
    events.next(new HttpResponse({ body: line('preview', proposal) })); expect(onPreview).not.toHaveBeenCalled();
  });

  it('rejects truncated, invalid, or failed streams instead of allowing partial drafts to be applied', async () => {
    for (const body of [line('preview', proposal), line('complete', { ...proposal, widgets: [{ ...proposal.widgets[0], id: 'invented' }] }), '{broken', JSON.stringify({ type: 'error', code: 'INTERFACE_AI_TIMEOUT' })]) {
      const service = new InterfaceGenerationService({ post: () => of(new HttpResponse({ body })) } as never);

      await expect(service.generate('test', [tile])).rejects.toThrow();
    }
  });

  it('bounds the whole request even if the server keeps sending data', async () => {
    vi.useFakeTimers();

    try {
      const events = new Subject<HttpEvent<string>>();
      const pending = new InterfaceGenerationService({ post: () => events } as never).generate('test', [tile]);
      const assertion = expect(pending).rejects.toMatchObject({ code: 'INTERFACE_AI_TIMEOUT' });

      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(10000);
        events.next({ type: HttpEventType.DownloadProgress, loaded: 1, partialText: line('start') });
      }

      await vi.advanceTimersByTimeAsync(5000); await assertion; expect(events.observed).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
