import { ApplicationRef, Component, EnvironmentInjector, Injectable, Input, createComponent } from '@angular/core';
import { toJpeg } from 'html-to-image';
import { PageLayoutPanelComponent, type PanelCard } from '../../../device/v2/panel/page-layout-panel';
import type { UiTheme } from '../../../core/device-v2/ui-theme';
import type { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { toPageLayout, type InterfaceTile } from './interface-draft';
import { validateWorkflowProposal } from './interface-workflow';

export interface ClientPreview {
  preview: { mimeType: 'image/jpeg'; data: string; width: 390; height: number };
  issues: string[];
}

@Component({
  selector: 'app-interface-capture', standalone: true, imports: [PageLayoutPanelComponent],
  template: `<main><header><strong>设备控制面板</strong><small>界面预览 · 示例状态</small></header>
    <app-page-layout-panel [cards]="cards" [theme]="theme" /></main>`,
  styles: [`:host { display:block; } main { box-sizing:border-box; padding:20px 16px 28px; }
    header { display:flex; flex-direction:column; gap:8px; margin-bottom:20px; }
    strong { font-size:20px; } small { font-size:12px; opacity:.7; }`],
})
class InterfaceCaptureComponent {
  @Input() cards: PanelCard[] = [];
  @Input() theme: UiTheme = 'natural';
}

@Injectable({ providedIn: 'root' })
export class InterfacePreviewService {
  constructor(private readonly application: ApplicationRef, private readonly environment: EnvironmentInjector) {}

  async render(proposal: unknown, source: InterfaceTile[], snapshot: DeviceUiSnapshot,
    style: UiTheme, signal: AbortSignal): Promise<ClientPreview> {
    const result = validateWorkflowProposal(proposal, source, snapshot, style);
    const layout = toPageLayout(result.tiles, snapshot, 1, style);
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:390px;pointer-events:none;';
    document.body.append(host);
    const component = createComponent(InterfaceCaptureComponent, { environmentInjector: this.environment, hostElement: host });
    this.application.attachView(component.hostView);
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      this.application.detachView(component.hostView);
      component.destroy();
      host.remove();
    };
    signal.addEventListener('abort', dispose, { once: true });

    try {
      signal.throwIfAborted();
      component.setInput('theme', style);
      component.setInput('cards', layout.widgets.map(widget => {
        const field = snapshot.endpoints.find(field => field.key === widget.endpointKey)!;
        // Images contain deterministic example states, never the user's live device values.
        const value = field.valueType === 'boolean' ? true : field.valueType === 'text' ? field.choices?.[0] ?? '示例'
          : ['integer', 'number'].includes(field.valueType) ? exampleNumber(field.minimum, field.maximum) : undefined;
        return { widget, field, value, display: value === true ? '开启' : value === undefined ? '—' : String(value),
          draft: value === undefined ? '' : String(value), error: '', disabled: false } satisfies PanelCard;
      }));
      component.changeDetectorRef.detectChanges();
      await document.fonts.ready;
      signal.throwIfAborted();
      const css = getComputedStyle(host.querySelector('.panel')!);
      const root = host.querySelector('main')!;
      root.style.background = css.getPropertyValue('--ui-bg');
      root.style.color = css.getPropertyValue('--ui-ink');
      const issues: string[] = [];

      for (const width of [768, 390]) {
        host.style.width = `${width}px`;
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        signal.throwIfAborted();
        host.querySelectorAll<HTMLElement>('[data-widget-id]').forEach(element => {
          if (element.scrollWidth > element.clientWidth + 2) issues.push(`${width}px ${element.dataset['widgetId']}: 内容横向溢出`);
        });
      }
      const height = Math.ceil(root.getBoundingClientRect().height);
      if (height < 1 || height > 12000) throw new Error('INTERFACE_PREVIEW_TOO_LARGE');
      const image = await toJpeg(root, { width: 390, height, pixelRatio: 1, quality: 0.85,
        skipFonts: true, backgroundColor: root.style.background });
      signal.throwIfAborted();
      const data = image.slice(image.indexOf(',') + 1);
      if (!image.startsWith('data:image/jpeg;base64,') || data.length > 2 * 1024 * 1024) throw new Error('INTERFACE_PREVIEW_TOO_LARGE');
      return { preview: { mimeType: 'image/jpeg', data, width: 390, height }, issues: issues.slice(0, 16) };
    } finally {
      signal.removeEventListener('abort', dispose);
      dispose();
    }
  }
}

// A mid-range example reads better in previews than an empty minimum.
function exampleNumber(minimum?: number, maximum?: number): number {
  if (minimum === undefined || maximum === undefined) return minimum ?? 0;
  return Math.round(minimum + (maximum - minimum) * 0.62);
}
