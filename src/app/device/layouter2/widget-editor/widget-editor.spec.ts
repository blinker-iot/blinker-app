import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  AlertController,
  IonicModule,
  ModalController,
  Platform,
} from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { LayouterService } from '../../layouter.service';
import { styleList } from '../widgets/config';
import { ParentDynamicComponent } from '../widgets/parentDynamic.component';
import { WidgetTextComponent } from '../widgets/widget-text/widget-text';
import { WidgetEditor } from './widget-editor';

vi.mock('@ionic/angular', () => ({
  ActionSheetController: class {},
  AlertController: class {},
  IonicModule: class {},
  ModalController: class {},
  Platform: class {},
}));

vi.mock('@ionic/angular/standalone', () => ({
  AlertController: class {},
  IonRouterLink: class {},
  LoadingController: class {},
  NavController: class {},
  Platform: class {},
  ToastController: class {},
}));

describe('WidgetEditor text style previews', () => {
  let fixture: ComponentFixture<WidgetEditor> | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();

    TestBed.overrideComponent(WidgetEditor, {
      remove: { imports: [IonicModule] },
      add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
    });
    TestBed.overrideComponent(ParentDynamicComponent, {
      set: {
        imports: [WidgetTextComponent],
        schemas: [CUSTOM_ELEMENTS_SCHEMA],
      },
    });

    await TestBed.configureTestingModule({
      imports: [WidgetEditor],
      providers: [
        { provide: AlertController, useValue: {} },
        { provide: ModalController, useValue: {} },
        { provide: Platform, useValue: { is: () => false } },
        {
          provide: LayouterService,
          useValue: { gridLength: 30, gridMargin: 4 },
        },
        { provide: DeviceService, useValue: {} },
        { provide: NoticeService, useValue: {} },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    fixture?.destroy();
    vi.useRealTimers();
  });

  it('updates every text style preview from the draft without mutating the source widget', () => {
    const sourceText = '已保存文本';
    const draftText = '尚未保存的新草稿文本';
    const liveText = '设备实时文本';
    const sourceWidget = {
      type: 'tex',
      key: 'statusText',
      lstyle: 0,
      cols: 2,
      rows: 1,
      t0: sourceText,
      t1: '已保存副文本',
      size: 14,
      ico: 'fal fa-font',
      clr: '#389BEE',
    };
    const device = {
      data: {
        layouterData: {},
        statusText: {
          tex: liveText,
          tex1: '设备实时副文本',
        },
      },
    };

    fixture = TestBed.createComponent(WidgetEditor);
    fixture.componentRef.setInput('widget', sourceWidget);
    fixture.componentRef.setInput('device', device);
    fixture.detectChanges();

    const textSetting = Array.from(
      fixture.nativeElement.querySelectorAll('.setting-item')
    ).find(
      (item: Element) =>
        item.querySelector('[item-name]')?.textContent?.trim() === '显示文本'
    ) as HTMLElement | undefined;
    const input = textSetting?.querySelector('input') as HTMLInputElement | null;

    expect(input).not.toBeNull();
    input!.value = draftText;
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const previews = fixture.debugElement.queryAll(
      By.directive(WidgetTextComponent)
    );
    expect(previews).toHaveLength(styleList.tex.length);
    expect(
      previews.map(
        (preview) => (preview.componentInstance as WidgetTextComponent).t0
      )
    ).toEqual(Array(styleList.tex.length).fill(draftText));

    const renderedPreviewTitles = Array.from(
      fixture.nativeElement.querySelectorAll('.setting-box0 widget-text .title')
    ) as HTMLElement[];
    expect(renderedPreviewTitles.length).toBeGreaterThan(0);
    expect(
      renderedPreviewTitles.every(
        (title) => title.textContent?.trim() === draftText
      )
    ).toBe(true);
    expect(
      renderedPreviewTitles.every(
        (title) => !title.parentElement?.textContent?.includes('设备实时副文本')
      )
    ).toBe(true);

    const settingNames = Array.from(
      fixture.nativeElement.querySelectorAll('.setting-item [item-name]')
    ).map((item: Element) => item.textContent?.trim());
    expect(settingNames).toContain('文本字号');
    expect(settingNames).toContain('文本位置');
    expect(settingNames).not.toContain('显示文本2');
    expect(settingNames).not.toContain('显示图标');
    expect(settingNames).not.toContain('文本1颜色');
    expect(styleList.tex).toEqual([
      { cols: 2, rows: 1 },
      { cols: 4, rows: 1 },
      { cols: 6, rows: 1 },
      { cols: 8, rows: 1 },
    ]);

    const sizeSetting = (
      Array.from(
        fixture.nativeElement.querySelectorAll('.setting-item')
      ) as Element[]
    ).find(
      (item) =>
        item.querySelector('[item-name]')?.textContent?.trim() === '文本字号'
    );
    const sizeInput = sizeSetting?.querySelector(
      'input'
    ) as HTMLInputElement | null;
    expect(sizeInput?.type).toBe('number');
    expect(sizeInput?.min).toBe('10');
    expect(sizeInput?.max).toBe('24');

    const alignmentButtons = Array.from(
      fixture.nativeElement.querySelectorAll('.text-align-options button')
    ) as HTMLButtonElement[];
    expect(alignmentButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '靠左',
      '居中',
      '靠右',
    ]);
    expect(
      alignmentButtons.map((button) =>
        button.querySelector('i')?.classList.item(1)
      )
    ).toEqual(['fa-align-left', 'fa-align-center', 'fa-align-right']);
    alignmentButtons[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.widget.align).toBe('center');
    expect(sourceWidget).not.toHaveProperty('align');
    expect(
      fixture.nativeElement
        .querySelector('.setting-box0 widget-text .text-widget')
        ?.getAttribute('data-align')
    ).toBe('center');

    expect(fixture.componentInstance.widget).not.toBe(sourceWidget);
    expect(fixture.componentInstance.widget.t0).toBe(draftText);
    expect(sourceWidget.t0).toBe(sourceText);
  });
});

describe('WidgetEditor deletion', () => {
  it('removes the widget before the modal leave animation finishes', async () => {
    const sourceWidget = { type: 'btn', key: 'btn-delete' };
    let finishDismiss = () => undefined;
    const dismiss = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishDismiss = () => resolve(true);
        })
    );
    const modalController = {
      getTop: vi.fn().mockResolvedValue({ dismiss }),
    };
    const layouterService = {
      delWidget: vi.fn(),
    };
    const editor = new WidgetEditor(
      {} as any,
      modalController as any,
      {} as any,
      {} as any,
      {} as any,
      layouterService as any,
      {} as any,
      {} as any
    );
    editor.widget = sourceWidget;
    editor.ngOnInit();

    const deletion = editor.delete();

    expect(layouterService.delWidget).toHaveBeenCalledWith(sourceWidget);
    await Promise.resolve();
    expect(dismiss).toHaveBeenCalledWith(undefined, 'delete');

    finishDismiss();
    await deletion;
  });
});

describe('ParentDynamicComponent editor dismissal', () => {
  it('does not refresh a widget after it was deleted', async () => {
    const refresh = vi.fn();
    let finishDismiss = (_result: { role: string }) => undefined;
    const didDismiss = new Promise<{ role: string }>((resolve) => {
      finishDismiss = resolve;
    });
    const modal = {
      onDidDismiss: vi.fn(() => didDismiss),
      present: vi.fn().mockResolvedValue(undefined),
    };
    const modalController = {
      create: vi.fn().mockResolvedValue(modal),
    };
    const parent = new ParentDynamicComponent(modalController as any);
    parent.widget = { type: 'btn', key: 'btn-delete' };
    parent.device = {};
    parent.widgetComponent = { refresh } as any;

    const editing = parent.edit();
    await vi.waitFor(() => expect(modal.present).toHaveBeenCalledOnce());

    finishDismiss({ role: 'delete' });
    await editing;

    expect(refresh).not.toHaveBeenCalled();
  });
});
