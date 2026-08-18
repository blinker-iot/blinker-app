import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  Gridster,
  GridsterConfig,
  GridsterItem,
  GridsterItemConfig,
  GridType,
} from 'angular-gridster2';
import { Layouter2EditTapDirective } from './widgets/edit-tap.directive';

@Component({
  selector: 'app-layouter2-edit-interaction-host',
  standalone: true,
  imports: [Gridster, GridsterItem, Layouter2EditTapDirective],
  styles: `
    gridster { width: 120px; height: 120px; }
    .edit-mask { position: absolute; inset: 0; }
  `,
  template: `
    <gridster [options]="options">
      <gridster-item [item]="item">
        <div class="widget-dynamic">
          @if (editMode) {
          <div
            class="edit-mask layouter2-drag-handle"
            (appLayouter2EditTap)="openEditor()"
          ></div>
          }
        </div>
      </gridster-item>
    </gridster>
  `,
})
class Layouter2EditInteractionHostComponent {
  editorOpened = false;
  editMode = true;

  readonly item: GridsterItemConfig = {
    x: 0,
    y: 0,
    cols: 1,
    rows: 1,
  };

  readonly options: GridsterConfig = {
    gridType: GridType.Fixed,
    fixedColWidth: 100,
    fixedRowHeight: 100,
    minCols: 1,
    maxCols: 1,
    minRows: 1,
    maxRows: 1,
    mobileBreakpoint: 0,
    draggable: {
      enabled: true,
      ignoreContent: true,
      dragHandleClass: 'layouter2-drag-handle',
    },
    resizable: { enabled: false },
  };

  openEditor(): void {
    this.editorOpened = true;
  }
}

describe('Layouter2 edit and drag interaction', () => {
  let fixture: ComponentFixture<Layouter2EditInteractionHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Layouter2EditInteractionHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(Layouter2EditInteractionHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders the full-surface interaction mask in edit mode', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.edit-mask')).not.toBeNull();
  });

  it('opens the editor from a full-surface press without movement', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const mask = element.querySelector<HTMLElement>('.edit-mask');
    const item = element.querySelector<HTMLElement>('gridster-item');

    mask?.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    }));
    mask?.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    }));

    expect(item?.classList.contains('gridster-item-moving')).toBe(true);

    mask?.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientX: 20,
      clientY: 20,
    }));
    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 20,
      clientY: 20,
    }));

    await new Promise((resolve) => window.setTimeout(resolve));
    expect(fixture.componentInstance.editorOpened).toBe(true);
    expect(item?.classList.contains('gridster-item-moving')).toBe(false);
  });

  it('drags from the same surface without opening the editor', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const mask = element.querySelector<HTMLElement>('.edit-mask');
    const item = element.querySelector<HTMLElement>('gridster-item');

    mask?.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    }));
    mask?.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    }));

    expect(item?.classList.contains('gridster-item-moving')).toBe(true);

    mask?.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 50,
      clientY: 20,
    }));
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 50,
      clientY: 20,
    }));

    mask?.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientX: 50,
      clientY: 20,
    }));
    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 50,
      clientY: 20,
    }));

    await new Promise((resolve) => window.setTimeout(resolve));
    expect(item?.classList.contains('gridster-item-moving')).toBe(false);
    expect(fixture.componentInstance.editorOpened).toBe(false);
  });
});
