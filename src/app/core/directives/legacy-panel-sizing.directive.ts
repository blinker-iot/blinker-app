import { AfterViewInit, DestroyRef, Directive, ElementRef } from '@angular/core';

export function measureLegacyPanel(panel: HTMLElement): void {
  const width = panel.getBoundingClientRect().width;
  if (!Number.isFinite(width) || width <= 0) return;
  const gap = Number.parseFloat(getComputedStyle(panel).getPropertyValue('--gap')) || 12;
  const compact = width <= 660, columns = compact ? 4 : 8;
  const row = `${Math.max(0, (width - (columns - 1) * gap) / columns)}px`;
  if (panel.style.getPropertyValue('--legacy-row-h') !== row) panel.style.setProperty('--legacy-row-h', row);
  panel.dataset['legacyGrid'] = compact ? 'compact' : 'wide';
  for (const node of Array.from(panel.children)) {
    if (!(node instanceof HTMLElement) || !node.classList.contains('cell')) continue;
    const span = Number(node.style.getPropertyValue('--span'));
    if (!Number.isInteger(span) || span < 1 || span > 8) continue;
    const value = String(Math.min(8, compact ? span * 2 : span));
    if (node.style.getPropertyValue('--legacy-span') !== value) node.style.setProperty('--legacy-span', value);
  }
}

@Directive({ selector: '.panel', standalone: true })
export class LegacyPanelSizingDirective implements AfterViewInit {
  private resize?: ResizeObserver;
  private changes?: MutationObserver;
  constructor(private readonly element: ElementRef<HTMLElement>, destroy: DestroyRef) {
    destroy.onDestroy(() => { this.resize?.disconnect(); this.changes?.disconnect(); });
  }
  ngAfterViewInit(): void {
    if (typeof CSS === 'undefined' || CSS.supports('width', '1cqw')) return;
    const panel = this.element.nativeElement, update = () => measureLegacyPanel(panel);
    // Only old kernels need measured pixels; current browsers keep native container queries.
    update();
    this.resize = new ResizeObserver(update);
    this.resize.observe(panel);
    this.changes = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList' ? record.target === panel : record.target.parentElement === panel)) update();
    });
    this.changes.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }
}
