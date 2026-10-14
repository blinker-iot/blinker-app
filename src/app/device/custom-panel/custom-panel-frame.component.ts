import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { type PanelAction, type PanelCard } from '../v2/widgets/widget-kit';
import { parseCustomPanel, type CustomPanelDocument } from '../../core/device-v2/custom-panel';

let runtime: Promise<{ script: string; styles: string }> | undefined;

function loadRuntime() {
  return runtime ??= fetch(new URL('custom-panel-runtime/runtime.json', document.baseURI)).then(async response => {
    if (!response.ok) throw new Error(`原子组件资源未加载（${response.status}）`);

    return response.json();
  }).catch(error => { runtime = undefined; throw error; });
}

@Component({
  selector: 'app-custom-panel-frame', standalone: true,
  template: `
    @if (error) { <p role="alert">{{ error }}</p><button type="button" (click)="prepare()">重试加载</button> }
    @if (source) {
      <iframe #frame title="自定义控制面板" sandbox="allow-scripts" referrerpolicy="no-referrer"
        [srcdoc]="source" (load)="loaded()"></iframe>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      height: var(--custom-panel-height, 100%);
      min-height: var(--custom-panel-min-height, 0px);
    }

    iframe {
      display: block;
      flex: 1 1 0;
      width: 100%;
      height: 100%;
      min-height: 0;
      border: 0;
      background: transparent;
    }
    p { color: var(--ui-alert); padding: 12px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class CustomPanelFrameComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) document!: CustomPanelDocument;
  @Input() cards: PanelCard[] = [];
  @Input() interactive = false;
  @Input() active = true;
  @Input() theme?: string;
  @Output() action = new EventEmitter<PanelAction>();
  @ViewChild('frame') private frame?: ElementRef<HTMLIFrameElement>;

  source?: SafeHtml;

  error = '';

  private channel = '';
  private html?: string;
  private ready = false;
  private readonly drafts = new Map<string, string>();
  private destroyed = false;
  private timeout?: ReturnType<typeof setTimeout>;
  private readonly message = (event: MessageEvent) => this.receive(event);

  constructor(private readonly sanitizer: DomSanitizer, private readonly cd: ChangeDetectorRef) {
    window.addEventListener('message', this.message);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['document'] && this.document?.html !== this.html) void this.prepare();
    else this.push();
  }

  ngOnDestroy(): void {
    this.destroyed = true;

    clearTimeout(this.timeout);
    window.removeEventListener('message', this.message);
  }

  loaded(): void {
    // A navigation never inherits the previous document's device access.
    this.ready = false;
  }

  async prepare(): Promise<void> {
    const channel = crypto.randomUUID();

    // Record the attempt before awaiting assets. State updates must never retry
    // a pending or failed document load; the retry button starts a new attempt.
    this.html = this.document?.html;
    this.channel = channel;
    this.ready = false;
    this.source = undefined;

    this.drafts.clear();

    this.error = '';

    clearTimeout(this.timeout);

    try {
      const panel = parseCustomPanel(this.document);
      const assets = await loadRuntime();

      if (this.destroyed || channel !== this.channel) return;

      const parsed = new DOMParser().parseFromString(panel.html, 'text/html');
      const csp = parsed.createElement('meta');

      csp.httpEquiv = 'Content-Security-Policy';
      // No app origin, storage, credentials, nested browsing contexts or external scripts.
      // HTTPS media remains available for the video atom and user supplied images.
      csp.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob: https:; media-src blob: https:; connect-src https:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; worker-src blob:";

      parsed.head.prepend(csp);

      parsed.documentElement.dataset['uiTheme'] = this.effectiveTheme;

      const style = parsed.createElement('style');

      style.textContent = assets.styles;

      csp.after(style);

      const script = parsed.createElement('script');
      script.textContent = `window.__BLINKER_CHANNEL__=${JSON.stringify(channel)};\n${assets.script}`.replace(/<\/script/gi, '<\\/script');

      parsed.body.append(script);

      // Executable HTML is intentionally confined to an opaque-origin sandbox.
      this.source = this.sanitizer.bypassSecurityTrustHtml('<!doctype html>' + parsed.documentElement.outerHTML);

      this.timeout = setTimeout(() => {
        if (channel !== this.channel || this.ready) return;

        this.error = '自定义界面未能启动，请检查 HTML 或重试。';

        this.cd.markForCheck();
      }, 15000);
    } catch (error) {
      if (channel !== this.channel || this.destroyed) return;

      this.error = error instanceof Error ? error.message : '自定义界面加载失败';
    }

    this.cd.markForCheck();
  }

  private get effectiveTheme(): string {
    return this.theme || this.document.theme;
  }

  private push(): void {
    if (!this.ready) return;

    this.frame?.nativeElement.contentWindow?.postMessage({ channel: this.channel, type: 'state', state: {
      cards: this.cards, interactive: this.interactive && this.active, theme: this.effectiveTheme,
    } }, '*');
  }

  private receive(event: MessageEvent): void {
    if (event.source !== this.frame?.nativeElement.contentWindow || event.origin !== 'null'
      || event.data?.channel !== this.channel) return;

    if (event.data.type === 'ready') {
      this.ready = true;
      this.error = '';

      clearTimeout(this.timeout);
      this.push();
      this.cd.markForCheck();

      return;
    }

    if (!this.ready || !this.active || !this.interactive || event.data.type !== 'action') return;

    // Never accept field metadata or bindings supplied by the frame.
    const card = this.cards.find(item => item.field.key === event.data.key);

    if (!card || !card.field.writable) return;

    const action = this.validateAction(card, event.data);

    if (!action) {
      this.frame?.nativeElement.contentWindow?.postMessage({ channel: this.channel, type: 'error',
        key: card.field.key, message: '指令不符合字段类型或取值范围' }, '*');

      return;
    }

    this.action.emit({ field: card.field, widgetId: card.widget.widgetId, ...action });
  }

  private validateAction(card: PanelCard, input: { kind?: unknown; value?: unknown }): Pick<PanelAction, 'kind' | 'value'> | undefined {
    const field = card.field;
    let { kind, value } = input;
    const numeric = field.valueType === 'integer' || field.valueType === 'number';

    if (kind === 'draft') {
      if ((!numeric && field.valueType !== 'text') || typeof value !== 'string' || value.length > 8192) return;

      this.drafts.set(field.key, value);

      return { kind, value };
    }

    if (kind === 'commit') {
      const raw = this.drafts.get(field.key) ?? card.draft;

      value = numeric && raw.trim() ? Number(raw) : raw;
      kind = numeric ? 'range' : 'select';
    }

    if (kind === 'invoke') {
      return field.role === 'action' && ['boolean', 'null'].includes(field.valueType) ? { kind } : undefined;
    }

    if (kind === 'toggle') return field.valueType === 'boolean' && typeof value === 'boolean' ? { kind, value } : undefined;

    if (kind === 'range') {
      if (!numeric || typeof value !== 'number' || !Number.isFinite(value)
        || field.valueType === 'integer' && !Number.isSafeInteger(value)
        || field.minimum !== undefined && value < field.minimum
        || field.maximum !== undefined && value > field.maximum) return;

      if (field.step) {
        const steps = (value - (field.minimum ?? 0)) / field.step;

        if (Math.abs(steps - Math.round(steps)) > 1e-7) return;
      }

      return { kind, value };
    }

    if (kind === 'select' && field.valueType === 'text' && typeof value === 'string'
      && new TextEncoder().encode(value).length <= (field.maxLength ?? 8192)
      && (!field.choices?.length || field.choices.includes(value))) return { kind, value };

    return undefined;
  }
}
