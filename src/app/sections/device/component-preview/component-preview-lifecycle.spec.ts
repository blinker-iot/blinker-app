import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { ComponentPreviewPage } from './component-preview.page';

describe('QA5 catalogue demo clock lifecycle', () => {
  let active: BehaviorSubject<boolean>;
  let fixture: ComponentFixture<ComponentPreviewPage> | undefined;
  let page: ComponentPreviewPage;

  beforeEach(async () => {
    active = new BehaviorSubject(true);
    await TestBed.configureTestingModule({
      imports: [ComponentPreviewPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'demo-only' }) } } },
        { provide: AppVisibilityService, useValue: { active } },
      ],
    })
      // Test the production page's lifecycle and demo data, not the 48-widget
      // visual matrix. No device port, native listener or transport is created.
      .overrideComponent(ComponentPreviewPage, { set: { template: '', imports: [] } })
      .compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(ComponentPreviewPage);
    page = fixture.componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
    active.complete();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const clock = () => vi.spyOn(page as unknown as { tick(): void }, 'tick');

  it('does no demo work before Ionic has entered the page', () => {
    const initial = page.sections, tick = clock();
    vi.advanceTimersByTime(6000);
    expect(tick).not.toHaveBeenCalled();
    expect(page.sections).toBe(initial);
  });

  it('updates real demo data once per period while entered and active', () => {
    const initial = page.sections, tick = clock();
    page.ionViewDidEnter();
    vi.advanceTimersByTime(2999); expect(tick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(tick).toHaveBeenCalledOnce();
    expect(page.sections).not.toBe(initial);
    vi.advanceTimersByTime(3000); expect(tick).toHaveBeenCalledTimes(2);
  });

  it('stops on cached leave without requiring destruction', () => {
    const tick = clock();
    page.ionViewDidEnter(); vi.advanceTimersByTime(3000);
    page.ionViewWillLeave(); const retained = page.sections;
    vi.advanceTimersByTime(9000);
    expect(tick).toHaveBeenCalledOnce();
    expect(page.sections).toBe(retained);
  });

  it('stops in background and resumes with a fresh period, without catch-up', () => {
    const tick = clock();
    page.ionViewDidEnter(); vi.advanceTimersByTime(1500);
    active.next(false); const retained = page.sections;
    vi.advanceTimersByTime(15000);
    expect(tick).not.toHaveBeenCalled(); expect(page.sections).toBe(retained);
    active.next(true);
    vi.advanceTimersByTime(2999); expect(tick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(tick).toHaveBeenCalledOnce();
  });

  it('does not restart a cached hidden page when the App resumes', () => {
    const tick = clock();
    page.ionViewDidEnter(); page.ionViewWillLeave();
    active.next(false); active.next(true);
    vi.advanceTimersByTime(6000); expect(tick).not.toHaveBeenCalled();
    page.ionViewDidEnter();
    vi.advanceTimersByTime(3000); expect(tick).toHaveBeenCalledOnce();
  });

  it('waits for foreground if the page enters while backgrounded', () => {
    const tick = clock();
    active.next(false); page.ionViewDidEnter();
    vi.advanceTimersByTime(6000); expect(tick).not.toHaveBeenCalled();
    active.next(true);
    vi.advanceTimersByTime(3000); expect(tick).toHaveBeenCalledOnce();
  });

  it('does not stack clocks or reset a running period on duplicate lifecycle signals', () => {
    const tick = clock();
    page.ionViewDidEnter(); vi.advanceTimersByTime(1500);
    page.ionViewDidEnter(); active.next(true); active.next(true);
    vi.advanceTimersByTime(1500); expect(tick).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(3000); expect(tick).toHaveBeenCalledTimes(2);
  });

  it('retains selection, draft, settings and history across leave and resume', () => {
    const text = page.sections.flatMap(section => section.cards).find(card => card.field.valueType === 'text')!;
    page.select(text.widget.widgetId);
    page.onAction({ kind: 'draft', field: text.field, value: '未提交草稿' });
    page.videoSettings = { ...page.videoSettings, title: '保留的视频设置' };
    const retained = page.sections, settings = page.videoSettings;
    page.ionViewDidEnter(); vi.advanceTimersByTime(1500);
    page.ionViewWillLeave(); active.next(false); vi.advanceTimersByTime(9000);
    active.next(true); page.ionViewDidEnter();
    vi.advanceTimersByTime(2999);
    expect(page.sections).toBe(retained); expect(page.videoSettings).toBe(settings);
    expect(page.selectedId).toBe(text.widget.widgetId);
    expect(page.selected?.draft).toBe('未提交草稿');
    expect(page.selected?.history).toBe(retained.flatMap(section => section.cards).find(card => card.field.key === text.field.key)?.history);
  });

  it('fences a cleared callback even after a new visible generation starts', () => {
    const intervals = vi.spyOn(globalThis, 'setInterval'), tick = clock();
    page.ionViewDidEnter();
    const callback = intervals.mock.calls.find(call => call[1] === 3000)?.[0];
    expect(typeof callback).toBe('function');
    page.ionViewWillLeave(); page.ionViewDidEnter();
    (callback as () => void)();
    expect(tick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000); expect(tick).toHaveBeenCalledOnce();
  });

  it('unsubscribes and cannot restart or run a stale callback after destroy', () => {
    const intervals = vi.spyOn(globalThis, 'setInterval'), tick = clock();
    page.ionViewDidEnter();
    const callback = intervals.mock.calls.find(call => call[1] === 3000)?.[0];
    const observers = active.observers.length;
    expect(observers).toBe(1);
    fixture!.destroy(); fixture = undefined;
    expect(active.observers).toHaveLength(0);
    active.next(false); active.next(true); page.ionViewDidEnter();
    if (typeof callback === 'function') callback();
    vi.advanceTimersByTime(6000); expect(tick).not.toHaveBeenCalled();
  });
});
