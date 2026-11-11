import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PanelModeSelectorComponent } from './panel-mode-selector.component';

describe('PanelModeSelectorComponent', () => {
  let fixture: ComponentFixture<PanelModeSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PanelModeSelectorComponent] }).compileComponents();
    fixture = TestBed.createComponent(PanelModeSelectorComponent);
    fixture.componentRef.setInput('currentMode', 'normal');
    fixture.componentRef.setInput('hasCustomPanel', true);
    fixture.detectChanges();
  });

  function root(): HTMLElement { return fixture.nativeElement as HTMLElement; }
  function radios(): NodeListOf<HTMLInputElement> { return root().querySelectorAll('input[type="radio"]'); }

  it('uses one native radio group and labels previews as non-live structural examples', () => {
    expect(radios()).toHaveLength(2);
    expect(radios()[0].name).toBe(radios()[1].name);
    expect(radios()[0].checked).toBe(true);
    expect(root().querySelectorAll('.page-preview[aria-hidden="true"]')).toHaveLength(2);
    expect(root().textContent).toContain('缩略图仅为布局示意');
    expect(root().querySelector('iframe, app-page-layout-panel, app-device-v2')).toBeNull();
  });

  it('selection only changes a draft; explicit confirmation emits once', () => {
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);

    radios()[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.draftMode).toBe('custom');
    expect(fixture.componentInstance.currentMode).toBe('normal');
    expect(confirmed).not.toHaveBeenCalled();
    expect(root().querySelector('.mode-option:first-of-type .current-badge')?.textContent).toBe('当前使用');
    expect(root().textContent).toContain('尚未确认');

    (root().querySelector('.confirm-action') as HTMLButtonElement).click();
    expect(confirmed).toHaveBeenCalledExactlyOnceWith('custom');
  });

  it('cancel discards the draft without confirming or mutating the applied mode', () => {
    const confirmed = vi.fn();
    const cancelled = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.componentInstance.selectMode('custom');
    fixture.componentInstance.cancelDraft();

    expect(fixture.componentInstance.draftMode).toBe('normal');
    expect(fixture.componentInstance.currentMode).toBe('normal');
    expect(cancelled).toHaveBeenCalledOnce();
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('resets the draft when the parent supplies another applied mode', () => {
    fixture.componentInstance.selectMode('custom');
    fixture.componentRef.setInput('currentMode', 'custom');
    fixture.detectChanges();

    expect(radios()[1].checked).toBe(true);
    expect(fixture.componentInstance.confirmDisabled).toBe(true);

    fixture.componentRef.setInput('currentMode', 'normal');
    fixture.detectChanges();
    expect(radios()[0].checked).toBe(true);
  });

  it('does not confirm an unchanged applied mode', () => {
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.confirmSelection();

    expect(fixture.componentInstance.confirmDisabled).toBe(true);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('offers creation to an owner without pretending a custom document exists', () => {
    fixture.componentRef.setInput('hasCustomPanel', false);
    fixture.detectChanges();
    radios()[1].click();
    fixture.detectChanges();

    expect(root().textContent).toContain('尚未创建');
    expect(fixture.componentInstance.confirmLabel).toBe('创建自定义面板');
    expect(fixture.componentInstance.confirmDisabled).toBe(false);
    expect(root().textContent).toContain('创建完成前不会切换');
  });

  it('prevents a shared user selecting a custom document that does not exist', () => {
    fixture.componentRef.setInput('shared', true);
    fixture.componentRef.setInput('hasCustomPanel', false);
    fixture.detectChanges();

    expect(radios()[1].disabled).toBe(true);
    fixture.componentInstance.selectMode('custom');
    expect(fixture.componentInstance.draftMode).toBe('normal');
    expect(root().textContent).toContain('请所有者先创建面板');
    expect(root().textContent).toContain('仅更改这台手机');
  });

  it('invalidates an old draft when document availability or sharing scope changes', () => {
    fixture.componentInstance.selectMode('custom');
    fixture.componentRef.setInput('hasCustomPanel', false);
    fixture.componentRef.setInput('shared', true);
    fixture.detectChanges();

    expect(fixture.componentInstance.draftMode).toBe('normal');
    expect(radios()[1].disabled).toBe(true);
    expect(fixture.componentInstance.confirmDisabled).toBe(true);
  });

  it('blocks selection, confirmation and cancellation while busy', () => {
    const confirmed = vi.fn();
    const cancelled = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.componentInstance.selectMode('custom');
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    fixture.componentInstance.selectMode('normal');
    fixture.componentInstance.confirmSelection();
    fixture.componentInstance.cancelDraft();

    expect(fixture.componentInstance.draftMode).toBe('custom');
    expect(Array.from(radios()).every(input => input.disabled)).toBe(true);
    expect(confirmed).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
    expect(root().querySelector('.cancel-action')?.hasAttribute('disabled')).toBe(true);
  });

  it('retains the draft when a parent save fails and shows its inline error', () => {
    fixture.componentInstance.selectMode('custom');
    fixture.componentRef.setInput('error', '保存失败，请重试');
    fixture.detectChanges();

    expect(fixture.componentInstance.draftMode).toBe('custom');
    expect(root().querySelector('[role="alert"]')?.textContent).toContain('保存失败');
    expect(fixture.componentInstance.confirmDisabled).toBe(false);
  });
});
