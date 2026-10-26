import { ComponentRef, createComponent, provideZonelessChangeDetection, Type } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { PageWidgetComponent } from '../app/device/v2/panel/page-widget';
import { VideoWidgetComponent } from '../app/device/v2/widgets/video/video-widget';
import { WeatherWidgetComponent } from '../app/device/v2/widgets/weather/weather-widget';
import type { PanelCard, WidgetAct } from '../app/device/v2/widgets/widget-kit';
import { presetForVariant, WIDGET_PRESETS, WidgetPresetId } from '../app/core/device-v2/widget-presets';
import { PAGE_WIDGET_VARIANTS, PageWidgetVariant, parseWidgetOptions } from '../app/core/device-v2/page-widget';
import { variantsFor } from '../app/core/device-v2/page-layout';

interface FrameState {
  cards: PanelCard[];
  interactive: boolean;
  theme: string;
  readOnlyScroll?: boolean;
}

declare global {
  interface Window {
    __BLINKER_CHANNEL__: string;

    blinker: {
      readonly fields: PanelCard['field'][];

      subscribe(listener: (state: Record<string, unknown>) => void): () => void;
      setValue(key: string, value: boolean | number | string): void;
      invoke(key: string): void;
    };
  }
}

async function start(): Promise<void> {
  const app = await createApplication({ providers: [provideZonelessChangeDetection()] });
  const channel = window.__BLINKER_CHANNEL__;
  let state: FrameState = { cards: [], interactive: false, theme: 'natural' };
  const atoms = new Set<Atom>();
  const subscribers = new Set<(values: Record<string, unknown>) => void>();
  const values = () => Object.fromEntries(state.cards.map(card => [card.field.key, card.value]));
  const post = (message: object) => parent.postMessage({ channel, ...message }, '*');
  let heightFrame = 0;
  let lastHeight = 0;
  let sizeObserver: ResizeObserver | undefined;

  function reportHeight(): void {
    if (!state.readOnlyScroll || heightFrame) return;

    heightFrame = requestAnimationFrame(() => {
      heightFrame = 0;

      if (!state.readOnlyScroll) return;

      const height = Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));

      if (height !== lastHeight) {
        lastHeight = height;

        post({ type: 'height', height });
      }
    });
  }

  function syncReadOnlyScroll(): void {
    document.documentElement.toggleAttribute('data-readonly-scroll', state.readOnlyScroll === true);

    if (state.readOnlyScroll && !sizeObserver) {
      sizeObserver = new ResizeObserver(reportHeight);

      sizeObserver.observe(document.body);
      sizeObserver.observe(document.documentElement);
    } else if (!state.readOnlyScroll) {
      cancelAnimationFrame(heightFrame);

      heightFrame = 0;

      sizeObserver?.disconnect();

      sizeObserver = undefined;
      lastHeight = 0;
    }

    reportHeight();
  }

  window.addEventListener('pagehide', () => {
    sizeObserver?.disconnect();

    sizeObserver = undefined;

    cancelAnimationFrame(heightFrame);

    heightFrame = 0;
  }, { once: true });

  function act(key: string, action: WidgetAct): void {
    if (state.interactive) post({ type: 'action', key, ...action });
  }

  window.blinker = {
    get fields() { return state.cards.map(card => ({ ...card.field })); },
    subscribe(listener) {
      subscribers.add(listener);
      listener(values());

      return () => subscribers.delete(listener);
    },
    setValue(key, value) {
      const kind = typeof value === 'boolean' ? 'toggle' : typeof value === 'number' ? 'range' : 'select';

      act(key, { kind, value });
    },
    invoke(key) { act(key, { kind: 'invoke' }); },
  };

  class Atom extends HTMLElement {
    static get observedAttributes() { return ['field', 'label', 'preset', 'options', 'span', 'rows', 'extra-keys']; }

    private ref?: ComponentRef<PageWidgetComponent>;
    private mount?: HTMLElement;

    connectedCallback(): void {
      atoms.add(this);
      this.render();
    }

    disconnectedCallback(): void {
      atoms.delete(this);
      this.ref?.destroy();

      this.ref = undefined;

      this.mount?.remove();

      this.mount = undefined;
    }

    attributeChangedCallback(): void { if (this.isConnected) this.render(); }

    render(): void {
      const variant = this.localName.slice('blinker-'.length) as PageWidgetVariant;
      const defaultPreset = presetForVariant(variant);

      geometry(this, defaultPreset.width, defaultPreset.height);

      try {
        const presetId = this.getAttribute('preset') as WidgetPresetId | null;
        const preset = presetId ? WIDGET_PRESETS[presetId] : defaultPreset;

        if (!preset || preset.variant !== variant) throw new Error('组件预置不匹配');

        const width = dimension(this.getAttribute('span'), preset.width, 8);
        const height = dimension(this.getAttribute('rows'), preset.height, 12);

        // Unavailable fields still occupy the atom's declared space in the grid.
        geometry(this, width, height);

        const source = state.cards.find(card => card.field.key === this.getAttribute('field'));

        if (!source) { this.clear('数据暂不可用'); return; }

        if (!variantsFor(preset.type, source.field).includes(variant)) {
          this.clear('此组件不适用于字段：' + source.field.key);

          return;
        }

        const options = parseWidgetOptions({ ...preset.options, ...JSON.parse(this.getAttribute('options') || '{}') }, variant);
        const extraKeys: unknown = JSON.parse(this.getAttribute('extra-keys') || '[]');

        if (!Array.isArray(extraKeys) || extraKeys.some(key => typeof key !== 'string')) throw new Error('附属读数字段无效');

        if (variant === 'memory') {
          if (options?.max !== undefined && options.max <= 0) throw new Error('总内存必须大于零');

          if (extraKeys.length > 1 || extraKeys.some(key => {
            const extra = state.cards.find(item => item.field.key === key);

            return key === source.field.key || !extra || !variantsFor('value', extra.field).includes('memory');
          })) throw new Error('总内存需要绑定一个独立的数值字段');
        }

        const card: PanelCard = { ...source, widget: { widgetId: source.widget.widgetId, endpointKey: source.field.key,
          type: preset.type, variant, options, title: this.getAttribute('label') || source.widget.title,
          grid: { x: 0, y: 0, width, height } },
          extras: extraKeys.slice(0, 3).flatMap(key => {
            const extra = state.cards.find(item => item.field.key === key);

            return extra ? [{ field: extra.field, value: extra.value }] : [];
          }),
        };

        this.classList.remove('atom-unavailable');

        if (!this.ref) {
          this.replaceChildren();

          this.mount = document.createElement('app-page-widget');

          this.append(this.mount);

          this.ref = createComponent(PageWidgetComponent, { environmentInjector: app.injector, hostElement: this.mount });

          this.ref.instance.action.subscribe(action => act(this.getAttribute('field') || '', action));
          app.attachView(this.ref.hostView);
        }

        this.ref.setInput('card', card);
        this.ref.setInput('interactive', state.interactive);
        this.ref.changeDetectorRef.detectChanges();
        this.querySelector(':scope > .atom-error')?.remove();
        this.classList.toggle('feedback', !!card.error);

        if (card.error) {
          const error = document.createElement('p');

          error.className = 'atom-error';

          error.setAttribute('role', 'alert');

          error.textContent = card.error;

          this.append(error);
        }
      } catch (error) { this.clear(error instanceof Error ? error.message : '组件配置无效'); }
    }

    private clear(message: string): void {
      this.ref?.destroy();

      this.ref = undefined;
      this.mount = undefined;
      this.textContent = message;

      this.classList.add('cell', 'atom-unavailable');
    }
  }

  for (const variant of Object.values(PAGE_WIDGET_VARIANTS).flat()) {
    customElements.define(`blinker-${variant}`, class extends Atom {});
  }

  function media(tag: string, component: Type<unknown>, attributes: string[], inputs: (element: HTMLElement) => Record<string, unknown>) {
    customElements.define(tag, class extends HTMLElement {
      static get observedAttributes() { return ['label', 'span', 'rows', ...attributes]; }

      private ref?: ComponentRef<unknown>;

      connectedCallback(): void {
        this.replaceChildren();

        const mount = document.createElement('div');

        mount.style.cssText = 'display:flex;flex:1;min-width:0;min-height:0';

        this.append(mount);

        this.ref = createComponent(component, { environmentInjector: app.injector, hostElement: mount });

        app.attachView(this.ref.hostView);
        this.render();
      }

      disconnectedCallback(): void { this.ref?.destroy(); this.ref = undefined; }

      attributeChangedCallback(): void { this.render(); }

      private render(): void {
        if (!this.ref) return;

        try {
          geometry(this, dimension(this.getAttribute('span'), 8, 8), dimension(this.getAttribute('rows'), 3, 12));

          for (const [name, value] of Object.entries(inputs(this))) this.ref.setInput(name, value);

          this.ref.changeDetectorRef.detectChanges();
        } catch { this.setAttribute('aria-label', '媒体组件配置无效'); }
      }
    });
  }

  media('blinker-video', VideoWidgetComponent, ['src', 'format', 'autoplay'], element => ({
    title: element.getAttribute('label') || '视频',
    source: { url: element.getAttribute('src') || '', str: element.getAttribute('format') === 'mjpg' ? 'mjpg' : 'hls',
      mode: element.getAttribute('autoplay') === 'true' ? 0 : 1 },
  }));

  media('blinker-weather', WeatherWidgetComponent, ['snapshot', 'forecast', 'alerts'], element => ({
    title: element.getAttribute('label') || '天气', snapshot: JSON.parse(element.getAttribute('snapshot') || 'null'),
    forecastHours: JSON.parse(element.getAttribute('forecast') || '[]'), alerts: JSON.parse(element.getAttribute('alerts') || '[]'),
  }));

  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.channel !== channel) return;

    if (event.data.type === 'error') {
      window.dispatchEvent(new CustomEvent('blinker-error', { detail: { key: event.data.key, message: event.data.message } }));

      return;
    }

    if (event.data.type === 'scroll') {
      const top = event.data.top;

      if (state.readOnlyScroll && Number.isFinite(top) && top >= 0) window.scrollTo(0, top);

      return;
    }

    if (event.data.type !== 'state') return;

    state = event.data.state;
    document.documentElement.dataset['uiTheme'] = state.theme;

    for (const atom of atoms) atom.render();

    syncReadOnlyScroll();

    for (const listener of subscribers) {
      try { listener(values()); } catch (error) { console.error(error); }
    }
  });

  const ready = () => post({ type: 'ready' });

  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready, { once: true });

  window.dispatchEvent(new Event('blinker-ready'));
}

function dimension(value: string | null, fallback: number, maximum: number): number {
  const number = value === null ? fallback : Number(value);

  if (!Number.isInteger(number) || number < 1 || number > maximum) throw new Error('组件尺寸无效');

  return number;
}

function geometry(element: HTMLElement, width: number, height: number): void {
  element.classList.add('cell');
  element.classList.toggle('full', width === 8);
  element.classList.toggle('wide', width >= 4);
  element.style.setProperty('--span', String(width));
  element.style.setProperty('--rows', String(height));
  element.style.setProperty('--col', 'auto');
  element.style.setProperty('--row', 'auto');
}

void start();
