import type { PageLayout, PageLayoutWidget, PageWidgetGrid } from './page-layout';

export type PanelDocument = Pick<PageLayout, 'schemaVersion' | 'columns' | 'widgets' | 'style'>;

export function gridsOverlap(left: PageWidgetGrid, right: PageWidgetGrid): boolean {
  return left.x < right.x + right.width && right.x < left.x + left.width
    && left.y < right.y + right.height && right.y < left.y + left.height;
}

// Keep an intended position when possible; find the next free slot otherwise.
export function placeWidget(widget: PageLayoutWidget, others: readonly PageLayoutWidget[]): PageLayoutWidget {
  const grid = { ...widget.grid, x: Math.min(widget.grid.x, 8 - widget.grid.width) };

  if (!others.some(other => gridsOverlap(grid, other.grid))) return { ...widget, grid };

  const bottom = others.reduce((row, other) => Math.max(row, other.grid.y + other.grid.height), 0);

  for (let y = grid.y; y <= Math.min(bottom, 65535); y++) {
    for (let x = 0; x <= 8 - grid.width; x++) {
      const candidate = { ...grid, x, y };

      if (!others.some(other => gridsOverlap(candidate, other.grid))) return { ...widget, grid: candidate };
    }
  }

  throw new Error('没有可放置部件的空位');
}

